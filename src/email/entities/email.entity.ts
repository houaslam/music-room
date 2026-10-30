import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Users } from '../../user/entities/user.entity.js';
import { EmailTypeEnum } from './email.enum.js';
import { IsNotEmpty } from 'class-validator';

@Entity()
@Index('email_tokens_resend_idx', { synchronize: false })
export class EmailTokens {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Users, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @Column({ type: 'enum', enum: EmailTypeEnum, enumName: 'email_token_type' })
  type: EmailTypeEnum;

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
  consumed_at: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  created_at: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'boolean', default: false })
  is_sent: boolean;
}
