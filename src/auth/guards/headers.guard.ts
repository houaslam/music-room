import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { DeviceHeadersDto } from '../dto/headers-validation.dto.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class HeadersGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers;

    const dtoInstance = plainToInstance(DeviceHeadersDto, headers, {
      excludeExtraneousValues: true,
    });

    const errors = await validate(dtoInstance);

    if (errors.length > 0) {
      const errorMessages = errors.flatMap((err) =>
        Object.values(err.constraints || {}),
      );
      throw new BadRequestException({
        code: "MISSING_CLIENT_HEADERS",
        message: 'Header validation failed',
        errors: errorMessages,
      });
    }
    return true;
  }
}
