import { IsEmail, IsNotEmpty, IsString, IsStrongPassword, Matches, MaxLength, MinLength } from "class-validator";


export class RegisterPayloadDTO {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsNotEmpty()
  @IsString()
  display_name: string;
}

