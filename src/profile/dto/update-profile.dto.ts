import {
  IsArray,
  IsDateString,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProfileItemsVisibility } from '../entities/profiles.enum.js';

export class UpdateProfileMusicPrefDTO {
  @IsOptional()
  @IsArray()
  @IsString({each:true})
  genres: string[];

  @IsOptional()
  @IsArray()
  @IsString({each:true})
  favorite_artists: string[];
}
export class UpdateProfileChangesDTO {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  display_name?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(ProfileItemsVisibility)
  bio_visibility?: ProfileItemsVisibility;

  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(ProfileItemsVisibility)
  birth_date_visibility?: ProfileItemsVisibility;

  @IsOptional()
  @IsString()
  phone?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(ProfileItemsVisibility)
  phone_visibility?: ProfileItemsVisibility;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(ProfileItemsVisibility)
  prefs_visibility?: ProfileItemsVisibility;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @IsOptional()
  @Type(() => UpdateProfileMusicPrefDTO)
  music_preferences:UpdateProfileMusicPrefDTO
}

export class UpdateUserDTO {
  @IsUUID()
  id: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateProfileChangesDTO)
  changes: UpdateProfileChangesDTO;
}
