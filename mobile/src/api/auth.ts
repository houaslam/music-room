import { request } from './client';

export type RegisterForm = {
  email: string;
  password: string;
  display_name: string;
};

export type RegisterResponse = {
  user_id: string;
};

export function register(form: RegisterForm): Promise<RegisterResponse> {
  return request<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: form,
  });
}

export async function deleteAccount(userId: string): Promise<void> {
  await request('/auth/delete', { method: 'DELETE', body: { id: userId } });
}
