import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProfileItemsVisibility } from './profiles.enum.js';
import { Users } from '../../user/entities/user.entity.js';

@Entity("profiles")
export class Profiles {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @OneToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: Users;

  @Column({ nullable: false, type: 'text' })
  display_name: string;

  @Column({ nullable: true, type: 'text' })
  avatar_url: string | null;

  @Column({ nullable: true, type: 'text' })
  bio: string | null;

  @Column({
    type: 'enum',
    enum: ProfileItemsVisibility,
    enumName: 'visibility',
    default: ProfileItemsVisibility.PUBLIC,
  })
  bio_visibility: ProfileItemsVisibility;

  @Column({ nullable: true, type: 'date' })
  birth_date: string | null;

  @Column({
    type: 'enum',
    enum: ProfileItemsVisibility,
    enumName: 'visibility',
    default: ProfileItemsVisibility.PRIVATE,
  })
  birth_date_visibility: ProfileItemsVisibility;

  @Column({ nullable: true, type: 'text' })
  phone: string | null;

  @Column({
    type: 'enum',
    enum: ProfileItemsVisibility,
    enumName: 'visibility',
    default: ProfileItemsVisibility.PRIVATE,
  })
  phone_visibility: ProfileItemsVisibility;

  @Column({
    type: 'enum',
    enum: ProfileItemsVisibility,
    enumName: 'visibility',
    default: ProfileItemsVisibility.PUBLIC,
  })
  prefs_visibility: ProfileItemsVisibility;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updated_at: Date;
}
