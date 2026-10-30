import { getMessage } from '../messages.js';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { SendEmailDTO } from './dto/send-email.dto.js';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly sender: string;

  constructor(configService: ConfigService) {
    this.sender = configService.getOrThrow<string>('EMAIL_USER');
    this.transporter = nodemailer.createTransport({
      host: configService.getOrThrow<string>('EMAIL_HOST'),
      port: Number(configService.getOrThrow<string>('EMAIL_PORT')),
      secure: false,
      auth: {
        user: this.sender,
        pass: configService.getOrThrow<string>('EMAIL_PASSWORD'),
      },
    });
  }

  async sendEmail(dto: SendEmailDTO): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.sender,
        to: dto.recipients,
        subject: dto.subject,
        html: dto.html,
        text: dto.text,
      });
    } catch (error) {
      this.logger.error(getMessage('email', 'SMTP_DELIVERY_FAILED'), error);
      throw new InternalServerErrorException(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: getMessage('email', 'INTERNAL_ERROR'),
          },
        },
        { cause: error },
      );
    }
  }
}
