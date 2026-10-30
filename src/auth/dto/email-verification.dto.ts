import { IsEmail, IsNotEmpty, IsString, IsStrongPassword, Matches, MaxLength, MinLength } from "class-validator";



export class EmailVerificationDTO{
  @IsNotEmpty()
  @IsEmail()
  email: string
}


