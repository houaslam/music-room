import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ProfileItemsVisibility,
} from '../entities/profiles.enum.js';
import { Transform } from 'class-transformer';

export class CreateProfileDTO {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(50)
  display_name: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsEnum(ProfileItemsVisibility)
  bio_visibility?: ProfileItemsVisibility;

  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @IsOptional()
  @IsEnum(ProfileItemsVisibility)
  birth_date_visibility?: ProfileItemsVisibility;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(ProfileItemsVisibility)
  phone_visibility?: ProfileItemsVisibility;

  @IsOptional()
  @IsEnum(ProfileItemsVisibility)
  prefs_visibility?: ProfileItemsVisibility;
}
