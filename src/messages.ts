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
    INVALID_REFRESH_TOKEN: "Refresh token is invalid",
    OAUTH_INVALID: "Invalid OAuth",
    OAUTH_EMAIL_MISSING: 'Google did not provide an email address',
    LINK_REQUIRED: 'Sign in to your existing account to link Google',
    PROVIDER_IDENTITY_IN_USE: 'This Google account is linked to another user',
    PROVIDER_ALREADY_LINKED: 'Your account is already linked to Google',
    NOT_LINKED: 'Your account is not linked to Google',
    LAST_LOGIN_METHOD: 'Set a password before unlinking your only login method',
  },
  user: {
    EMAIL_TAKEN: 'Email is already taken!',
  },
  profile: {
    PROFILE_NOT_FOUND: 'Profile not found',
    VALIDATION_ERROR: 'Request validation failed',
    INVALID_CREDENTIALS: 'Invalid credentials!',
  },
  friends: {
    VALIDATION_ERROR: 'Request validation failed',
    MISSING_CLIENT_HEADERS: 'Required client headers are missing or invalid',
    INVALID_CREDENTIALS: 'Invalid credentials!',
    RATE_LIMITED: 'Too many requests, please try again later',
    INTERNAL_ERROR: 'Internal error, please try again later!',
    SELF_FRIENDSHIP: 'You cannot create a friendship with yourself',
    USER_NOT_FOUND: 'User not found',
    INCOMING_REQUEST_EXISTS: 'This user already sent you a friend request',
    ALREADY_FRIENDS: 'You are already friends with this user',
    FRIEND_REQUEST_FORBIDDEN: 'You cannot accept your own friend request',
    FRIEND_REQUEST_NOT_FOUND: 'Friend request not found',
    FRIEND_REQUEST_NOT_PENDING: 'This friendship is already accepted',
  },
  email: {
    INTERNAL_ERROR: 'Email could not be sent. Please try again later.',
    SMTP_DELIVERY_FAILED: 'SMTP delivery failed',
  },
  passwordReset: {
    TOKEN_INVALID: 'Invalid or already used recovery token',
    TOKEN_EXPIRED: 'Recovery token has expired',
    TOKEN_ATTEMPTS_EXCEEDED: 'Recovery token attempt limit reached',
    SUBJECT: 'Reset your password',
    BODY: 'Your password recovery OTP is',
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
