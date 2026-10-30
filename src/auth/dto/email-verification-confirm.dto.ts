import { IsEmail, IsNotEmpty, IsString, IsStrongPassword, Matches, MaxLength, MinLength } from "class-validator";



export class EmailVerificationConfirmDTO{
  @IsNotEmpty()
  @Matches(/^\d{6}$/)
  token: string

  @IsEmail()
  email:string;
}