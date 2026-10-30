import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class RefreshPlayloadDTO{
    @IsString()
    @IsNotEmpty()
    refresh_token:string
}