import {
  IsBoolean,
  IsDate,
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateUserChangesDTO {
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  display_name?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  password_hash?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  email_verified_at?: Date | null;

  @IsOptional()
  @IsNumber()
  login_attemps?: number;

  @IsOptional()
  @IsBoolean()
  is_locked?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  unlock_at?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  failed_login_window_started_at?: Date | null;
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
