// the same rules as the backend dtos (src/auth/dto), checked here first so the
// user gets a clear message right away instead of a round trip to the server.
// the backend still checks everything, this is only to be nicer to the user.
// each one gives back the first problem it finds, or '' when it's all good

// not the full email rules, just something@something.something.
// the backend does the real check
const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

function checkEmail(email: string): string {
  if (!email) return 'Enter your email.';
  if (!EMAIL_SHAPE.test(email)) return "That email doesn't look right.";
  return '';
}

type RegisterForm = {
  email: string;
  displayName: string;
  password: string;
};

export function checkRegisterForm(form: RegisterForm): string {
  const emailError = checkEmail(form.email);
  if (emailError) return emailError;

  // the backend trims the display name before checking it, so we do too
  const displayName = form.displayName.trim();
  if (!displayName) return 'Enter a display name.';
  if (displayName.length > 50) return 'Display name can be 50 characters max.';

  if (form.password.length < 8) return 'Password needs at least 8 characters.';
  if (form.password.length > 128) return 'Password can be 128 characters max.';

  return '';
}

type LoginForm = {
  email: string;
  password: string;
};

// only what's needed to try, a wrong password is the server's job to say
export function checkLoginForm(form: LoginForm): string {
  const emailError = checkEmail(form.email);
  if (emailError) return emailError;

  if (!form.password) return 'Enter your password.';

  return '';
}

export function checkCode(code: string): string {
  if (!/^\d{6}$/.test(code)) return 'The code is 6 digits.';
  return '';
}
