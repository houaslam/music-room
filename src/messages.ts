export const MESSAGES = {
  app: {
    HELLO: 'Hello World!',
  },
  auth: {
    INVALID_CREDENTIALS: 'Invalid credentials!',
    ACCOUNT_LOCKED: 'Account is locked, retry in 5 mins!',
    EMAIL_NOT_VERIFIED: 'Email is not verified!',
    EMAIL_TAKEN: 'User with this email already exists',
    INTERNAL_ERROR: 'Internal error, please try again later!',
    USER_DELETED: 'User Deleted Successfully',
    DATA_CONFLICT: 'User Deletion was unsuccessfull',
    EMAIL_DELIVERY_FAILED: 'Error while sending the email: ',
  },
  user: {
    EMAIL_TAKEN: 'Email is already taken!',
  },
  email: {
    INTERNAL_ERROR: 'Email could not be sent. Please try again later.',
    SMTP_DELIVERY_FAILED: 'SMTP delivery failed',
  },
  emailVerification: {
    TOKEN_INVALID: 'Invalid token',
    TOKEN_EXPIRED: 'Token has expired',
    TOKEN_ATTEMPTS_EXCEEDED: 'Token attempt limit reached',
    OTP_SUBJECT: 'Your OTP Code',
    OTP_BODY: 'Your OTP is',
  },
} as const;

export type MessageService = keyof typeof MESSAGES;
export type MessageCode<Service extends MessageService> =
  keyof (typeof MESSAGES)[Service];

export function getMessage<
  Service extends MessageService,
  Code extends MessageCode<Service>,
>(service: Service, code: Code): (typeof MESSAGES)[Service][Code] {
  return MESSAGES[service][code];
}
