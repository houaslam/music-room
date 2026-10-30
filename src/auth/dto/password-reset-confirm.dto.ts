import { IsEmail, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class PasswordResetConfirmPayloadDTO {
  @IsUUID()
  @IsNotEmpty()
  token: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  new_password: string;
}
