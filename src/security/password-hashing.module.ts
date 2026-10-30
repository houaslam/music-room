import { Module } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';

@Module({
  providers: [
    {
      provide: PasswordHasher,
      useFactory: () => new PasswordHasher(),
    },
  ],
  exports: [PasswordHasher],
})
export class PasswordHashingModule {}
