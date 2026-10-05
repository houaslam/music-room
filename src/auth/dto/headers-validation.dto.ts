// headers-validation.dto.ts
import { IsIn, IsNotEmpty, IsUUID, Matches } from 'class-validator';
import { Expose } from 'class-transformer';

export class DeviceHeadersDto {
  @Expose({ name: 'x-platform' })
  @IsNotEmpty()
  @IsIn(['ios', 'android'], { message: 'X-Platform must be either android or ios' })
  platform: string;

  @Expose({ name: 'x-device-model' })
  @IsNotEmpty({ message: 'X-Device-Model is required' })
  deviceModel: string;

  @Expose({ name: 'x-app-version' })
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'X-App-Version must follow semantic versioning (e.g., 1.0.4)' })
  appVersion: string;

  @Expose({ name: 'x-device-id' })
  @IsNotEmpty()
  @IsUUID('all', { message: 'X-Device-Id must be a valid UUID' })
  deviceId: string;
}
