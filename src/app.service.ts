import { getMessage } from './messages.js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return getMessage('app', 'HELLO');
  }
}
