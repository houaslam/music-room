import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Users } from '../../user/entities/user.entity.js';

@Entity('music_preferences')
export class MusicPreferences {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @OneToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: Users;

  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'::text[]",
  })
  genres: string[];

  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'::text[]",
  })
  favorite_artists: string[];

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updated_at: Date;
}
