export type Role = 'admin' | 'user'

/** Someone as other people see them: their email, plus a name and avatar icon if they set them. */
export type Person = { email: string; name: string | null; avatar: string | null }

export type Me = Person & { role: Role }

export type AdminUser = {
  email: string
  name: string | null
  avatar: string | null
  role: Role
  activated: boolean
  invited_at: number | null
  activated_at: number | null
  created_at: string
}

export type ChecklistItem = { id: number; text: string; checked: boolean; position: number }
export type Access = 'owner' | 'edit' | 'view'
export type SharePermission = 'view' | 'edit'
/** shared: the recipient runs the list with their own checks. collaborative: they join the owner's one live run. */
export type ShareMode = 'shared' | 'collaborative'
/** Whose checks you see: the common run (owner and collaborators) or your own. */
export type Scope = 'common' | 'personal'
/** Identifies this browser tab so the server doesn't echo our own edits back over the live socket. */
export const clientId = Math.random().toString(36).slice(2)
export type ChecklistSummary = {
  id: number
  title: string
  icon: string | null
  updatedAt: string
  access: Access
  scope: Scope
  ownerEmail: string
  ownerName: string | null
  ownerAvatar: string | null
  itemCount: number
  checkedCount: number
}
export type Checklist = {
  id: number
  title: string
  icon: string | null
  updatedAt: string
  access: Access
  scope: Scope
  ownerEmail: string
  ownerName: string | null
  ownerAvatar: string | null
  items: ChecklistItem[]
}
/** A share the current user has granted. checklistId null means "all my lists". */
export type Share = Person & { id: number; permission: SharePermission; mode: ShareMode; checklistId: number | null }

export type HistoryRun = {
  id: number
  checklistId: number
  title: string
  by: string | null
  byName: string | null
  byAvatar: string | null
  completedAt: string
  durationSeconds: number | null
  total: number
  checked: number
  missed: string[]
}
export type History = {
  lists: Array<{ id: number; title: string; runs: number; lastRunAt: string; avgCompletion: number; avgDurationSeconds: number | null }>
  summary: { runs: number; last30Days: number; avgCompletion: number | null; avgDurationSeconds: number | null }
  weekly: Array<{ weekStart: string; runs: number }>
  missed: Array<{ checklistId: number; listTitle: string; text: string; missed: number; appeared: number }>
  runs: HistoryRun[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', 'x-client-id': clientId, ...init?.headers }
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
  updateProfile: (patch: { name?: string | null; avatar?: string | null }) =>
    request<Me>('/api/auth/me', json('PATCH', '/api/auth/me', patch)),
  login: (email: string, password: string) => request<Me>('/api/auth/login', json('POST', '/api/auth/login', { email, password })),
  register: (email: string, password: string) => request<Me>('/api/auth/register', json('POST', '/api/auth/register', { email, password })),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  activate: (token: string, password: string) => request<Me>('/api/auth/activate', json('POST', '/api/auth/activate', { token, password })),
  invite: (email: string) => request<{ email: string; resent: boolean; mail: string }>('/api/admin/invites', json('POST', '/api/admin/invites', { email })),
  users: () => request<{ users: AdminUser[] }>('/api/admin/users'),
  authConfig: () => request<{ canRegister: boolean; firstAccount: boolean }>('/api/auth/config'),
  adminSettings: () => request<{ registrationOpen: boolean }>('/api/admin/settings'),
  setRegistrationOpen: (registrationOpen: boolean) =>
    request<{ registrationOpen: boolean }>('/api/admin/settings', json('PUT', '/api/admin/settings', { registrationOpen })),

  checklists: () => request<{ checklists: ChecklistSummary[] }>('/api/checklists'),
  createChecklist: (title: string, icon: string | null) =>
    request<Checklist>('/api/checklists', json('POST', '/api/checklists', { title, icon })),
  getChecklist: (id: number) => request<Checklist>(`/api/checklists/${id}`),
  updateChecklist: (id: number, patch: { title?: string; icon?: string | null }) =>
    request<{ id: number; title: string; icon: string | null; updatedAt: string }>(
      `/api/checklists/${id}`,
      json('PATCH', `/api/checklists/${id}`, patch)
    ),
  deleteChecklist: (id: number) => request<{ ok: boolean }>(`/api/checklists/${id}`, { method: 'DELETE' }),
  duplicateChecklist: (id: number) => request<Checklist>(`/api/checklists/${id}/duplicate`, { method: 'POST' }),
  resetChecklist: (id: number) => request<{ items: ChecklistItem[] }>(`/api/checklists/${id}/reset`, { method: 'POST' }),
  addItem: (id: number, text: string) =>
    request<ChecklistItem>(`/api/checklists/${id}/items`, json('POST', `/api/checklists/${id}/items`, { text })),
  updateItem: (id: number, itemId: number, patch: { text?: string; checked?: boolean }) =>
    request<ChecklistItem>(`/api/checklists/${id}/items/${itemId}`, json('PATCH', `/api/checklists/${id}/items/${itemId}`, patch)),
  deleteItem: (id: number, itemId: number) => request<{ ok: boolean }>(`/api/checklists/${id}/items/${itemId}`, { method: 'DELETE' }),
  moveItem: (id: number, itemId: number, direction: 'up' | 'down') =>
    request<{ items: ChecklistItem[] }>(
      `/api/checklists/${id}/items/${itemId}/move`,
      json('POST', `/api/checklists/${id}/items/${itemId}/move`, { direction })
    ),
  reorderItems: (id: number, order: number[]) =>
    request<{ items: ChecklistItem[] }>(
      `/api/checklists/${id}/items/reorder`,
      json('POST', `/api/checklists/${id}/items/reorder`, { order })
    ),

  shares: () => request<{ shares: Share[] }>('/api/shares'),
  putShare: (email: string, permission: SharePermission, mode: ShareMode, checklistId: number | null) =>
    request<Share>('/api/shares', json('PUT', '/api/shares', { email, permission, mode, checklistId })),
  deleteShare: (id: number) => request<{ ok: boolean }>(`/api/shares/${id}`, { method: 'DELETE' }),

  history: (checklistId: number | null) => request<History>(checklistId === null ? '/api/history' : `/api/history?checklistId=${checklistId}`)
}
