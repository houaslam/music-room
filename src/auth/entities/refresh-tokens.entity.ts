import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Users } from '../../user/entities/user.entity.js';
import { IsNotEmpty } from 'class-validator';
import { RefreshFamilies } from './refresh-families.entity.js';

@Entity()
export class RefreshTokens {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  users_id: Users;

  @Column('uuid')
  @Index()
  family_id: string;

  @ManyToOne(() => RefreshFamilies, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'family_id' })
  family: RefreshFamilies;

  @Column('uuid')
  device_id: string;

  @Column({ type: 'uuid', unique: true })
  jti: string;

  @Column({ type: 'timestamptz', nullable: true })
  used_at: Date | null;

  @Column({ unique: true, type: 'text' })
  @IsNotEmpty()
  token_hash: string;

  @Column({
    type: 'timestamptz',
  })
  expires_at: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  revoked_at: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  created_at: Date;
}
