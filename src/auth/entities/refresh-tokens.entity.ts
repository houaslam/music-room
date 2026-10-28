
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Users } from '../../user/entities/user.entity.js';
import { IsNotEmpty, IsUUID } from 'class-validator';

@Entity()
export class RefreshTokens {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  users_id: Users;

  @IsUUID()
  @IsNotEmpty()
  family_id: string;

  @IsUUID()
  device_id: string;

  @Column({ unique: true, type: 'text' })
  @IsNotEmpty()
  token_hash: string;

  @Column({
    type: 'timestamptz',
  })
  expires_at: Date;

  @Column({
    type: 'timestamptz',
  })
  revoked_at: Date;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  created_at: Date;
}
