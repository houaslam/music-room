import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ReadUserDTO {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
