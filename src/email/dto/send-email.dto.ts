import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendEmailDTO {
  @IsEmail({}, { each: true })
  recipients: string[];

  @IsString()
  subject: string;

  @IsString()
  html: string;

  @IsString()
  @IsOptional()
  text?: string;
}
