import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, max, MaxLength, maxLength, MinLength } from 'class-validator';

export class CreateUserDTO {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  password_hash: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(50)
  display_name: string;
}
