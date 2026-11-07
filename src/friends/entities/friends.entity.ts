import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Users } from '../../user/entities/user.entity.js';
import { FriendshipStatus } from './friends-enum.entity.js';

@Entity('friendships')
@Check('no_self_friendship', 'requester_id <> addressee_id')
@Index('friendships_pair_idx', { synchronize: false })
@Index('friendships_addressee_idx', ['addressee_id', 'status'])
export class Friendships {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  requester_id: string;

  @ManyToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'requester_id', referencedColumnName: 'id' })
  requester: Users;

  @Column({ type: 'uuid' })
  addressee_id: string;

  @ManyToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'addressee_id', referencedColumnName: 'id' })
  addressee: Users;

  @Column({
    type: 'enum',
    enum: FriendshipStatus,
    enumName: 'friendship_status',
    default: FriendshipStatus.PENDING,
  })
  status: FriendshipStatus;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updated_at: Date;
}
