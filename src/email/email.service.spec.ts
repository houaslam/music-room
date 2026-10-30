import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { EmailService } from './email.service.js';

const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => ({ createTransport: smtp.createTransport }));

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    smtp.sendMail.mockResolvedValue({ accepted: ['user@example.com'] });
    smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
    const settings: Record<string, string> = {
      EMAIL_HOST: 'smtp.example.com',
      EMAIL_PORT: '587',
      EMAIL_USER: 'sender@example.com',
      EMAIL_PASSWORD: 'test-secret',
    };
    service = new EmailService(new ConfigService(settings));
  });

  it('reuses its transporter and includes the plain text email body', async () => {
    const message = {
      recipients: ['user@example.com'],
      subject: 'Verification',
      html: '<p>Code</p>',
      text: 'Code',
    };
    await service.sendEmail(message);
    await service.sendEmail(message);

    expect(smtp.createTransport).toHaveBeenCalledTimes(1);
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: 'sender@example.com',
      to: message.recipients,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it('reports SMTP failure using the API error format and preserves its cause', async () => {
    const cause = new Error('SMTP unavailable');
    smtp.sendMail.mockRejectedValue(cause);
    const error = await service
      .sendEmail({
        recipients: ['user@example.com'],
        subject: 'Verification',
        html: '<p>Code</p>',
      })
      .catch((error: unknown) => error);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as InternalServerErrorException).getResponse()).toMatchObject(
      {
        error: { code: 'INTERNAL_ERROR' },
      },
    );
    expect((error as Error).cause).toBe(cause);
  });
});
