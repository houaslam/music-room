import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class PasswordResetConfirmPayloadDTO {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string;
}
