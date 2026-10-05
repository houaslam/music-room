import { IsEmail, IsNotEmpty, IsString, IsStrongPassword, MaxLength, MinLength } from "class-validator";

export class AuthPayloadDTO {
  username: string;
  password: string;
}

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

export class DeletePayloadDTO {
  @IsString()
  id: string;
}
