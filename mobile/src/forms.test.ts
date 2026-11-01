import { checkCode, checkLoginForm, checkRegisterForm } from './forms';

describe('checkRegisterForm', () => {
  const form = {
    email: 'adam@test.com',
    displayName: 'adam',
    password: 'password123',
  };

  it('is fine with a good form', () => {
    expect(checkRegisterForm(form)).toBe('');
  });

  it.each([
    ['', 'Enter your email.'],
    ['adam', "That email doesn't look right."],
    ['adam@test', "That email doesn't look right."],
    ['adam @test.com', "That email doesn't look right."],
  ])('checks the email %p', (email, message) => {
    expect(checkRegisterForm({ ...form, email })).toBe(message);
  });

  it('asks for a display name', () => {
    expect(checkRegisterForm({ ...form, displayName: '' })).toBe(
      'Enter a display name.',
    );
    expect(checkRegisterForm({ ...form, displayName: '   ' })).toBe(
      'Enter a display name.',
    );
  });

  it('keeps the display name to 50 characters like the backend', () => {
    expect(checkRegisterForm({ ...form, displayName: 'a'.repeat(50) })).toBe(
      '',
    );
    expect(checkRegisterForm({ ...form, displayName: 'a'.repeat(51) })).toBe(
      'Display name can be 50 characters max.',
    );
  });

  it('does not count the spaces around the display name, the backend trims them', () => {
    expect(
      checkRegisterForm({ ...form, displayName: ` ${'a'.repeat(50)} ` }),
    ).toBe('');
  });

  it('wants a password between 8 and 128 characters like the backend', () => {
    expect(checkRegisterForm({ ...form, password: 'a'.repeat(7) })).toBe(
      'Password needs at least 8 characters.',
    );
    expect(checkRegisterForm({ ...form, password: 'a'.repeat(8) })).toBe('');
    expect(checkRegisterForm({ ...form, password: 'a'.repeat(128) })).toBe('');
    expect(checkRegisterForm({ ...form, password: 'a'.repeat(129) })).toBe(
      'Password can be 128 characters max.',
    );
  });

  it('gives the first problem only, top to bottom like the form', () => {
    expect(
      checkRegisterForm({ email: '', displayName: '', password: '' }),
    ).toBe('Enter your email.');
  });
});

describe('checkLoginForm', () => {
  it('is fine with a good form', () => {
    expect(
      checkLoginForm({ email: 'adam@test.com', password: 'password123' }),
    ).toBe('');
  });

  it('checks the email', () => {
    expect(checkLoginForm({ email: '', password: 'password123' })).toBe(
      'Enter your email.',
    );
    expect(checkLoginForm({ email: 'adam', password: 'password123' })).toBe(
      "That email doesn't look right.",
    );
  });

  it('asks for the password', () => {
    expect(checkLoginForm({ email: 'adam@test.com', password: '' })).toBe(
      'Enter your password.',
    );
  });
});

describe('checkCode', () => {
  it('is fine with 6 digits', () => {
    expect(checkCode('123456')).toBe('');
  });

  it.each(['', '12345', '1234567', '12a456', '12 456'])(
    'says the code is 6 digits for %p',
    (code) => {
      expect(checkCode(code)).toBe('The code is 6 digits.');
    },
  );
});
