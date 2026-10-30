import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Users } from '../../user/entities/user.entity.js';

@Entity('refresh_families')
export class RefreshFamilies {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  user_id: string;

  @ManyToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @Column('uuid')
  device_id: string;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;
}
