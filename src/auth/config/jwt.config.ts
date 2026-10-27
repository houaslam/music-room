import { registerAs } from "@nestjs/config";
import { JwtModuleOptions } from "@nestjs/jwt";
import type { StringValue } from 'ms';

export default registerAs(
    'jwt',
    (): JwtModuleOptions => ({
        secret: process.env.ACCESS_TOKEN_SECRET,
        signOptions: {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN as StringValue
        }
    })
)
