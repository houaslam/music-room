import {
  IsDate,
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserChangesDTO {
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  display_name?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  password_hash?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  email_verified_at?: Date | null;
}

export class UpdateUserDTO {
  @IsUUID()
  id: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateUserChangesDTO)
  changes: UpdateUserChangesDTO;
}