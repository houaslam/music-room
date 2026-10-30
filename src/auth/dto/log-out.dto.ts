import { IsNotEmpty, IsString } from "class-validator";

export class LogOutPayloadDTO{
    @IsString()
    @IsNotEmpty()
    refresh_token:string;
}