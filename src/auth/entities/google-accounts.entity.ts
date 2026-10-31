import {
    Column,
    CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Users } from '../../user/entities/user.entity.js';

@Entity('google_accounts')
@Unique(['users_id'])
export class GoogleAccounts {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  users_id: Users;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  linked_at: Date;

  @Column({type: "text", nullable: false, unique:true})
  google_user_id:string

}
