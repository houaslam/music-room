import { getDeviceHeaders } from '../device';

// "localhost" on a phone or on the android emulator is the phone itself,
// so set EXPO_PUBLIC_API_URL in .env (see .env.example)
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

// no automatic retry on purpose: if register reached the server but the answer
// got lost, sending it again would come back as EMAIL_TAKEN. the user can tap again
export async function request<T>(
  path: string,
  { method, body }: RequestOptions,
): Promise<T> {
  const headers = await getDeviceHeaders();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'TIMEOUT', 'The server took too long to answer.');
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      "Can't reach the server, check your connection.",
    );
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // no body (204) or not json
  }

  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

// the contract says errors look like { error: { code, message } }, but right now
// nest sends { code, message } flat, and ValidationPipe sends
// { message: string[], error: 'Bad Request' } with no code at all
type ErrorBody = {
  code?: string;
  message?: string | string[];
  error?: string | { code?: string; message?: string };
};

function toApiError(status: number, data: unknown): ApiError {
  const body = (data ?? {}) as ErrorBody;
  const details = typeof body.error === 'object' ? body.error : body;

  const code = details.code ?? fallbackCode(status);
  const message = Array.isArray(details.message)
    ? details.message.join('\n')
    : (details.message ?? 'Something went wrong on the server.');

  return new ApiError(status, code, message);
}

function fallbackCode(status: number): string {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'INTERNAL_ERROR';
  return `HTTP_${status}`;
}
