import { IsBoolean, IsNumber } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  IsNull,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Users {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'citext', unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  display_name: string | null;

  @Column()
  password_hash: string;

  @Column({ type: 'timestamptz', nullable: true })
  email_verified_at: Date | null;

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

  @Column({ type: 'int', default: 0 })
  @IsNumber()
  login_attemps: number;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  is_locked: boolean;

  @Column({ type: 'timestamptz' , nullable: true})
  unlock_at: Date | null;
}
