import { IsEmail, IsNotEmpty, IsString, IsStrongPassword, Matches, MaxLength, MinLength } from "class-validator";


export class DeletePayloadDTO {
  @IsString()
  id: string;
}
