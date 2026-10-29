import { IsEmail, IsNotEmpty } from 'class-validator';

export class PasswordResetPayloadDTO {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
