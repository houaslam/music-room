import { IsEmail, IsNotEmpty, IsString, IsStrongPassword, Matches, MaxLength, MinLength } from "class-validator";

export class AuthPayloadDTO {
  username: string;
  password: string;
}

