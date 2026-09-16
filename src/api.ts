export type Role = 'admin' | 'user'

export type Me = { email: string; role: Role }

export type AdminUser = {
  email: string
  role: Role
  activated: boolean
  invited_at: number | null
  activated_at: number | null
  created_at: string
}

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

const json = (method: string, path: string, payload: unknown): RequestInit => ({
  method,
  body: JSON.stringify(payload)
})

export const api = {
  me: () => request<Me>('/api/auth/me'),
  login: (email: string, password: string) => request<Me>('/api/auth/login', json('POST', '/api/auth/login', { email, password })),
  register: (email: string, password: string) => request<Me>('/api/auth/register', json('POST', '/api/auth/register', { email, password })),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  activate: (token: string, password: string) =>
    request<Me>('/api/auth/activate', json('POST', '/api/auth/activate', { token, password })),
  invite: (email: string) => request<{ email: string; resent: boolean; mail: string }>('/api/admin/invites', json('POST', '/api/admin/invites', { email })),
  users: () => request<{ users: AdminUser[] }>('/api/admin/users')
}
