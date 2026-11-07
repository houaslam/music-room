import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { Friendships } from './entities/friends.entity.js';
import { FriendshipStatus } from './entities/friends-enum.entity.js';
import { Profiles } from '../profile/entities/profiles.entity.js';
import { Users } from '../user/entities/user.entity.js';
import { getMessage, type MessageCode } from '../messages.js';

type Direction = 'incoming' | 'outgoing';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendships)
    private readonly friendshipsRepository: Repository<Friendships>,
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {}

  private error(code: MessageCode<'friends'>) {
    return { error: { code, message: getMessage('friends', code) } };
  }

  private checkTarget(user_id: string, target_id: string) {
    if (user_id === target_id)
      throw new BadRequestException(this.error('SELF_FRIENDSHIP'));
  }

  private pairWhere(a: string, b: string) {
    return [
      { requester_id: a, addressee_id: b },
      { requester_id: b, addressee_id: a },
    ];
  }

  // Shared by every mutation, including creation before a row exists.
  private async lockPair(manager: EntityManager, a: string, b: string) {
    const pair = [a, b].sort().join(':');
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [pair],
    );
  }

  private async requireTarget(manager: EntityManager, user_id: string) {
    const profile = await manager.findOne(Profiles, { where: { user_id } });
    const user = await manager.findOne(Users, { where: { id: user_id } });
    if (!profile || !user)
      throw new NotFoundException(this.error('USER_NOT_FOUND'));
  }

  private friendship(row: Friendships) {
    return {
      id: row.id,
      requester_id: row.requester_id,
      addressee_id: row.addressee_id,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private summary(profile: Profiles) {
    return {
      user_id: profile.user_id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    };
  }

  private relationship(row: Friendships | null, user_id: string) {
    if (!row || row.status === FriendshipStatus.BLOCKED) return 'none';
    if (row.status === FriendshipStatus.ACCEPTED) return 'accepted';
    return row.requester_id === user_id
      ? 'outgoing_pending'
      : 'incoming_pending';
  }

  private async profilesFor(rows: Friendships[], user_id: string) {
    const ids = rows.map((row) =>
      row.requester_id === user_id ? row.addressee_id : row.requester_id,
    );
    if (!ids.length) return new Map<string, Profiles>();
    const profiles = await this.entityManager.find(Profiles, {
      where: { user_id: In(ids) },
      relations: { user: true },
    });
    return new Map(
      profiles
        .filter((profile) => profile.user)
        .map((profile) => [profile.user_id, profile]),
    );
  }

  async listFriends(user_id: string) {
    const rows = await this.friendshipsRepository.find({
      where: [
        { requester_id: user_id, status: FriendshipStatus.ACCEPTED },
        { addressee_id: user_id, status: FriendshipStatus.ACCEPTED },
      ],
      order: { updated_at: 'DESC', id: 'DESC' },
    });
    const profiles = await this.profilesFor(rows, user_id);
    return {
      items: rows.flatMap((row) => {
        const profile = profiles.get(
          row.requester_id === user_id ? row.addressee_id : row.requester_id,
        );
        return profile
          ? [
              {
                id: row.id,
                user: this.summary(profile),
                updated_at: row.updated_at,
              },
            ]
          : [];
      }),
    };
  }

  async searchUsers(user_id: string, display_name: string) {
    const pattern = `%${display_name.replace(/[\\%_]/g, '\\$&')}%`;
    const profiles = await this.entityManager
      .createQueryBuilder(Profiles, 'profile')
      .innerJoin('profile.user', 'account')
      .where('profile.user_id <> :user_id', { user_id })
      .andWhere("profile.display_name ILIKE :pattern ESCAPE '\\'", { pattern })
      .andWhere(
        `NOT EXISTS (
        SELECT 1 FROM friendships blocked
        WHERE blocked.status = :blocked AND
        ((blocked.requester_id = :user_id AND blocked.addressee_id = profile.user_id)
        OR (blocked.addressee_id = :user_id AND blocked.requester_id = profile.user_id))
      )`,
        { blocked: FriendshipStatus.BLOCKED },
      )
      .orderBy('LOWER(profile.display_name)', 'ASC')
      .addOrderBy('profile.user_id', 'ASC')
      .getMany();
    const pairs = await this.friendshipsRepository.find({
      where: [{ requester_id: user_id }, { addressee_id: user_id }],
    });
    const byUser = new Map(
      pairs.map((row) => [
        row.requester_id === user_id ? row.addressee_id : row.requester_id,
        row,
      ]),
    );
    return {
      items: profiles.flatMap((profile) => {
        const row = byUser.get(profile.user_id) ?? null;
        return row?.status === FriendshipStatus.BLOCKED
          ? []
          : [
              {
                ...this.summary(profile),
                relationship_status: this.relationship(row, user_id),
                id: row?.id ?? null,
              },
            ];
      }),
    };
  }

  async listRequests(user_id: string, direction: Direction = 'incoming') {
    const rows = await this.friendshipsRepository.find({
      where:
        direction === 'outgoing'
          ? { requester_id: user_id, status: FriendshipStatus.PENDING }
          : { addressee_id: user_id, status: FriendshipStatus.PENDING },
      order: { created_at: 'DESC', id: 'DESC' },
    });
    const profiles = await this.profilesFor(rows, user_id);
    return {
      items: rows.flatMap((row) => {
        const profile = profiles.get(
          direction === 'outgoing' ? row.addressee_id : row.requester_id,
        );
        return profile
          ? [{ ...this.friendship(row), user: this.summary(profile) }]
          : [];
      }),
    };
  }

  private existingRequest(row: Friendships, user_id: string) {
    if (row.status === FriendshipStatus.BLOCKED)
      throw new NotFoundException(this.error('USER_NOT_FOUND'));
    if (row.status === FriendshipStatus.ACCEPTED)
      throw new ConflictException(this.error('ALREADY_FRIENDS'));
    if (row.requester_id !== user_id)
      throw new ConflictException(this.error('INCOMING_REQUEST_EXISTS'));
    return { created: false, friendship: this.friendship(row) };
  }

  async sendRequest(user_id: string, addressee_id: string) {
    this.checkTarget(user_id, addressee_id);
    try {
      return await this.entityManager.transaction(async (manager) => {
        await this.lockPair(manager, user_id, addressee_id);
        await this.requireTarget(manager, addressee_id);
        const row = await manager.findOne(Friendships, {
          where: this.pairWhere(user_id, addressee_id),
        });
        if (row) return this.existingRequest(row, user_id);
        const created = await manager.save(Friendships, {
          requester_id: user_id,
          addressee_id,
          status: FriendshipStatus.PENDING,
        });
        return { created: true, friendship: this.friendship(created) };
      });
    } catch (error) {
      if (
        !(error instanceof QueryFailedError) ||
        error.driverError?.code !== '23505'
      )
        throw error;
      const row = await this.friendshipsRepository.findOne({
        where: this.pairWhere(user_id, addressee_id),
      });
      if (!row) throw error;
      await this.requireTarget(this.entityManager, addressee_id);
      return this.existingRequest(row, user_id);
    }
  }

  private isParticipant(row: Friendships, user_id: string) {
    return row.requester_id === user_id || row.addressee_id === user_id;
  }

  private async withRequest<T>(
    user_id: string,
    id: string,
    action: (manager: EntityManager, row: Friendships | null) => Promise<T>,
  ) {
    return this.entityManager.transaction(async (manager) => {
      const initial = await manager.findOne(Friendships, { where: { id } });
      if (
        !initial ||
        !this.isParticipant(initial, user_id) ||
        initial.status === FriendshipStatus.BLOCKED
      ) {
        return action(manager, null);
      }
      await this.lockPair(manager, initial.requester_id, initial.addressee_id);
      const row = await manager.findOne(Friendships, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      return action(
        manager,
        row &&
          this.isParticipant(row, user_id) &&
          row.status !== FriendshipStatus.BLOCKED
          ? row
          : null,
      );
    });
  }

  async acceptRequest(user_id: string, id: string) {
    return this.withRequest(user_id, id, async (manager, row) => {
      if (!row)
        throw new NotFoundException(this.error('FRIEND_REQUEST_NOT_FOUND'));
      if (row.addressee_id !== user_id)
        throw new ForbiddenException(this.error('FRIEND_REQUEST_FORBIDDEN'));
      if (row.status === FriendshipStatus.ACCEPTED) return this.friendship(row);
      row.status = FriendshipStatus.ACCEPTED;
      return this.friendship(await manager.save(Friendships, row));
    });
  }

  async declineRequest(user_id: string, id: string) {
    await this.withRequest(user_id, id, async (manager, row) => {
      if (!row) return;
      if (row.status === FriendshipStatus.ACCEPTED)
        throw new ConflictException(this.error('FRIEND_REQUEST_NOT_PENDING'));
      await manager.delete(Friendships, row.id);
    });
  }

  async getRelationship(user_id: string, target_id: string) {
    this.checkTarget(user_id, target_id);
    await this.requireTarget(this.entityManager, target_id);
    const row = await this.friendshipsRepository.findOne({
      where: this.pairWhere(user_id, target_id),
    });
    if (row?.status === FriendshipStatus.BLOCKED)
      throw new NotFoundException(this.error('USER_NOT_FOUND'));
    return {
      user_id: target_id,
      relationship_status: this.relationship(row, user_id),
      id: row?.id ?? null,
    };
  }

  async deleteFriendship(user_id: string, target_id: string) {
    this.checkTarget(user_id, target_id);
    await this.entityManager.transaction(async (manager) => {
      await this.lockPair(manager, user_id, target_id);
      const row = await manager.findOne(Friendships, {
        where: this.pairWhere(user_id, target_id),
        lock: { mode: 'pessimistic_write' },
      });
      if (row?.status === FriendshipStatus.ACCEPTED)
        await manager.delete(Friendships, row.id);
    });
  }
}
