export type Me = { email: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers }
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // non-JSON response body
  }
  if (!res.ok) {
    let message = res.statusText
    if (body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      message = body.error
    }
    throw new Error(message)
  }
  return body as T
}

export const api = {
  me: () => request<Me>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<Me>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}
