import { request } from './client';

export type RegisterForm = {
  email: string;
  password: string;
  display_name: string;
};

export type RegisterResponse = {
  user_id: string;
};

export type Tokens = {
  access_token: string;
  refresh_token: string;
  // seconds the access token lives (900 = 15 min)
  expires_in: number;
};

export type Me = {
  user_id: string;
  email: string;
  email_verified: boolean;
  has_password: boolean;
  linked_providers: string[];
};

export function register(form: RegisterForm): Promise<RegisterResponse> {
  return request<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: form,
  });
}

// the code from the mail goes in "token", that's the name the backend uses
export async function confirmEmail(email: string, code: string): Promise<void> {
  await request('/auth/email-verification/confirm', {
    method: 'POST',
    body: { email, token: code },
  });
}

export async function resendCode(email: string): Promise<void> {
  await request('/auth/email-verification', {
    method: 'POST',
    body: { email },
  });
}

export function login(email: string, password: string): Promise<Tokens> {
  return request<Tokens>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function refresh(refreshToken: string): Promise<Tokens> {
  return request<Tokens>('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await request('/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

export async function logoutAll(accessToken: string): Promise<void> {
  await request('/auth/logout-all', { method: 'POST', token: accessToken });
}

export function me(accessToken: string): Promise<Me> {
  return request<Me>('/auth/me', { method: 'GET', token: accessToken });
}

// the backend takes the user from the token, not from the body
export async function deleteAccount(accessToken: string): Promise<void> {
  await request('/auth/delete', { method: 'DELETE', token: accessToken });
}
