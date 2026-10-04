export interface Env {
  ASSETS: Fetcher
  DB: D1Database
}

type Role = 'admin' | 'user'
type User = { id: number; email: string; role: Role }
type Checklist = { id: number; user_id: number; title: string; icon: string | null; updated_at: string }
type Item = { id: number; checklist_id: number; text: string; checked: number; position: number }

const COOKIE_NAME = 'checky_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TITLE_MAX = 200
const ITEM_TEXT_MAX = 500
const ITERATIONS = 600_000
const ICONS = new Set([
  'Waves', 'Sailboat', 'Anchor', 'Fish', 'Droplet', 'Tent', 'Mountain', 'Trees', 'Palmtree', 'Compass', 'Backpack', 'Snowflake', 'Sun', 'Flame',
  'Dumbbell', 'Bike', 'Car', 'Plane', 'Luggage', 'Home', 'Wrench', 'Hammer', 'Tractor', 'PaintRoller', 'Scissors', 'Package', 'ShoppingCart',
  'UtensilsCrossed', 'Coffee', 'Wine', 'Briefcase', 'Book', 'Music', 'Camera', 'Baby', 'Dog', 'Heart', 'Stethoscope', 'Sparkles', 'Shirt', 'ListChecks'
])

const attempts = new Map<string, number[]>()

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

function parseCookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chunk of (request.headers.get('cookie') ?? '').split(';')) {
    const index = chunk.indexOf('=')
    if (index !== -1) out[chunk.slice(0, index).trim()] = decodeURIComponent(chunk.slice(index + 1).trim())
  }
  return out
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256)
  return `pbkdf2-sha256$${ITERATIONS}$${encode(salt)}$${encode(new Uint8Array(bits))}`
}

async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, iterationString, salt, expected] = stored.split('$')
  const iterations = Number(iterationString)
  if (scheme !== 'pbkdf2-sha256' || !salt || !expected || !Number.isInteger(iterations) || iterations < 1) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: decode(salt), iterations, hash: 'SHA-256' }, key, 256))
  const expectedBytes = decode(expected)
  if (actual.length !== expectedBytes.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expectedBytes[index]
  return difference === 0
}

function newToken(): string { return encode(crypto.getRandomValues(new Uint8Array(32))) }
function asString(value: unknown): string { return typeof value === 'string' ? value : '' }
function serializeItem(item: Item) { return { id: item.id, text: item.text, checked: Boolean(item.checked), position: item.position } }

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
}

function limited(request: Request, name: string, limit: number, windowMs: number): Response | null {
  const now = Date.now()
  const key = `${name}:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`
  const recent = (attempts.get(key) ?? []).filter((time) => time > now - windowMs)
  recent.push(now)
  attempts.set(key, recent)
  return recent.length > limit ? json({ error: 'too many attempts, slow down' }, 429) : null
}

async function authenticated(request: Request, env: Env): Promise<User | null> {
  const token = parseCookies(request)[COOKIE_NAME]
  if (!token) return null
  return env.DB.prepare(`SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at >= ?`)
    .bind(await sha256(token), Date.now()).first<User>()
}

async function startSession(env: Env, userId: number): Promise<string> {
  const token = newToken()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_TTL_MS).run()
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
}

async function ownedChecklist(env: Env, user: User, id: number): Promise<Checklist | null> {
  if (!Number.isInteger(id)) return null
  const checklist = await env.DB.prepare('SELECT id, user_id, title, icon, updated_at FROM checklists WHERE id = ?').bind(id).first<Checklist>()
  return checklist?.user_id === user.id ? checklist : null
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method
  if (path === '/api/health' && method === 'GET') return json({ ok: true, smtp: false })

  if (path === '/api/auth/register' && method === 'POST') {
    const rate = limited(request, 'register', 10, 15 * 60_000); if (rate) return rate
    const input = await body(request), email = asString(input.email).trim(), password = asString(input.password)
    if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'enter a valid email' }, 400)
    if (password.length < 8 || password.length > 512) return json({ error: 'password must be 8-512 characters' }, 400)
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>()
    if ((count?.count ?? 0) > 0) return json({ error: 'registration is closed — ask an administrator to invite you' }, 403)
    try {
      const result = await env.DB.prepare('INSERT INTO users (email, pass_hash, role, activated_at) VALUES (?, ?, ?, ?)')
        .bind(email, await hashPassword(password), 'admin', Date.now()).run()
      return json({ email, role: 'admin' }, 201, { 'set-cookie': await startSession(env, Number(result.meta.last_row_id)) })
    } catch { return json({ error: 'an account already exists' }, 409) }
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const rate = limited(request, 'login', 5, 5 * 60_000); if (rate) return rate
    const input = await body(request), email = asString(input.email).trim(), password = asString(input.password)
    if (email.length > 254 || !EMAIL_RE.test(email) || !password) return json({ error: 'invalid email or password' }, 400)
    const user = await env.DB.prepare('SELECT id, email, pass_hash FROM users WHERE email = ?').bind(email).first<{ id: number; email: string; pass_hash: string | null }>()
    if (!user || !user.pass_hash || !(await verifyPassword(password, user.pass_hash))) return json({ error: user && !user.pass_hash ? 'account not activated — use the link from your invitation email' : 'invalid email or password' }, user && !user.pass_hash ? 403 : 401)
    return json({ email: user.email }, 200, { 'set-cookie': await startSession(env, user.id) })
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(request)[COOKIE_NAME]
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    return json({ ok: true }, 200, { 'set-cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0` })
  }

  if (path === '/api/auth/activate' && method === 'POST') {
    const rate = limited(request, 'activate', 5, 5 * 60_000); if (rate) return rate
    const input = await body(request), token = asString(input.token).trim(), password = asString(input.password)
    if (password.length < 8 || password.length > 512) return json({ error: 'password must be 8-512 characters' }, 400)
    if (token.length < 10 || token.length > 100) return json({ error: 'invitation link is invalid or has already been used' }, 400)
    const pending = await env.DB.prepare('SELECT id, email, pass_hash FROM users WHERE invite_token_hash = ?').bind(await sha256(token)).first<{ id: number; email: string; pass_hash: string | null }>()
    if (!pending || pending.pass_hash !== null) return json({ error: 'invitation link is invalid or has already been used' }, 400)
    await env.DB.prepare('UPDATE users SET pass_hash = ?, activated_at = ?, invite_token_hash = NULL WHERE id = ? AND pass_hash IS NULL')
      .bind(await hashPassword(password), Date.now(), pending.id).run()
    return json({ email: pending.email }, 200, { 'set-cookie': await startSession(env, pending.id) })
  }

  const user = await authenticated(request, env)
  if (path === '/api/auth/me' && method === 'GET') return user ? json({ email: user.email, role: user.role }) : json({ error: 'not signed in' }, 401)
  if (!user) return json({ error: 'not signed in' }, 401)

  if (path === '/api/admin/users' && method === 'GET') {
    if (user.role !== 'admin') return json({ error: 'admin only' }, 403)
    const users = await env.DB.prepare(`SELECT email, role, (pass_hash IS NOT NULL) AS activated, invited_at, activated_at, created_at FROM users ORDER BY (pass_hash IS NULL) DESC, COALESCE(invited_at, 0) DESC`).all()
    return json({ users: users.results.map((row: any) => ({ ...row, activated: Boolean(row.activated) })) })
  }

  if (path === '/api/admin/invites' && method === 'POST') {
    if (user.role !== 'admin') return json({ error: 'admin only' }, 403)
    const rate = limited(request, 'invite', 10, 15 * 60_000); if (rate) return rate
    const input = await body(request), email = asString(input.email).trim()
    if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'enter a valid email' }, 400)
    const existing = await env.DB.prepare('SELECT id, pass_hash FROM users WHERE email = ?').bind(email).first<{ id: number; pass_hash: string | null }>()
    if (existing?.pass_hash) return json({ error: 'a user with that email already exists' }, 409)
    const token = newToken(), now = Date.now(), tokenHash = await sha256(token)
    if (existing) await env.DB.prepare('UPDATE users SET invite_token_hash = ?, invited_at = ? WHERE id = ?').bind(tokenHash, now, existing.id).run()
    else await env.DB.prepare('INSERT INTO users (email, role, invite_token_hash, invited_at) VALUES (?, ?, ?, ?)').bind(email, 'user', tokenHash, now).run()
    console.warn(`[mail] development invite for ${email}: ${new URL(`/activate?token=${encodeURIComponent(token)}`, url).href}`)
    return json({ email, resent: Boolean(existing), mail: 'logged-to-worker' }, 202)
  }

  const checklistMatch = path.match(/^\/api\/checklists(?:\/(\d+))?(?:\/items(?:\/(\d+))?(?:\/(move))?)?(?:\/(reset))?$/)
  if (!checklistMatch) return json({ error: 'not found' }, 404)
  const checklistId = checklistMatch[1] ? Number(checklistMatch[1]) : null
  const itemId = checklistMatch[2] ? Number(checklistMatch[2]) : null
  const action = checklistMatch[3] ?? checklistMatch[4]

  if (checklistId === null && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT c.id, c.title, c.icon, c.updated_at, COUNT(ci.id) AS item_count, COALESCE(SUM(ci.checked), 0) AS checked_count FROM checklists c LEFT JOIN checklist_items ci ON ci.checklist_id = c.id WHERE c.user_id = ? GROUP BY c.id ORDER BY c.updated_at DESC, c.id DESC`).bind(user.id).all()
    return json({ checklists: rows.results.map((row: any) => ({ id: row.id, title: row.title, icon: row.icon, updatedAt: row.updated_at, itemCount: row.item_count, checkedCount: row.checked_count })) })
  }
  if (checklistId === null && method === 'POST') {
    const input = await body(request), title = asString(input.title).trim() || 'Untitled checklist', icon = input.icon === undefined || input.icon === null ? null : asString(input.icon)
    if (title.length > TITLE_MAX) return json({ error: `title must be ${TITLE_MAX} characters or fewer` }, 400)
    if (icon !== null && !ICONS.has(icon)) return json({ error: 'unknown icon' }, 400)
    const result = await env.DB.prepare('INSERT INTO checklists (user_id, title, icon) VALUES (?, ?, ?)').bind(user.id, title, icon).run()
    const row = await env.DB.prepare('SELECT id, title, icon, updated_at FROM checklists WHERE id = ?').bind(result.meta.last_row_id).first<any>()
    return json({ id: row.id, title: row.title, icon: row.icon, updatedAt: row.updated_at, items: [] }, 201)
  }
  if (checklistId === null) return json({ error: 'not found' }, 404)
  const checklist = await ownedChecklist(env, user, checklistId)
  if (!checklist) return json({ error: 'checklist not found' }, 404)

  if (!itemId && !action && method === 'GET') {
    const items = await env.DB.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE checklist_id = ? ORDER BY position, id').bind(checklist.id).all<Item>()
    return json({ id: checklist.id, title: checklist.title, icon: checklist.icon, updatedAt: checklist.updated_at, items: items.results.map(serializeItem) })
  }
  if (!itemId && !action && method === 'PATCH') {
    const input = await body(request)
    if (typeof input.title === 'string') {
      const title = input.title.trim(); if (!title) return json({ error: 'title cannot be empty' }, 400); if (title.length > TITLE_MAX) return json({ error: `title must be ${TITLE_MAX} characters or fewer` }, 400)
      await env.DB.prepare("UPDATE checklists SET title = ?, updated_at = datetime('now') WHERE id = ?").bind(title, checklist.id).run()
    }
    if ('icon' in input) { const icon = input.icon === null ? null : asString(input.icon); if (icon !== null && !ICONS.has(icon)) return json({ error: 'unknown icon' }, 400); await env.DB.prepare("UPDATE checklists SET icon = ?, updated_at = datetime('now') WHERE id = ?").bind(icon, checklist.id).run() }
    const row = await env.DB.prepare('SELECT id, title, icon, updated_at FROM checklists WHERE id = ?').bind(checklist.id).first<any>()
    return json({ id: row.id, title: row.title, icon: row.icon, updatedAt: row.updated_at })
  }
  if (!itemId && !action && method === 'DELETE') { await env.DB.prepare('DELETE FROM checklists WHERE id = ?').bind(checklist.id).run(); return json({ ok: true }) }
  if (!itemId && action === 'reset' && method === 'POST') { await env.DB.batch([env.DB.prepare('UPDATE checklist_items SET checked = 0 WHERE checklist_id = ?').bind(checklist.id), env.DB.prepare("UPDATE checklists SET updated_at = datetime('now') WHERE id = ?").bind(checklist.id)]); const items = await env.DB.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE checklist_id = ? ORDER BY position, id').bind(checklist.id).all<Item>(); return json({ items: items.results.map(serializeItem) }) }
  if (!itemId && !action && method === 'POST') { const input = await body(request), text = asString(input.text).trim(); if (!text) return json({ error: 'item text cannot be empty' }, 400); if (text.length > ITEM_TEXT_MAX) return json({ error: `item text must be ${ITEM_TEXT_MAX} characters or fewer` }, 400); const max = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) AS max_position FROM checklist_items WHERE checklist_id = ?').bind(checklist.id).first<{ max_position: number }>(); const result = await env.DB.prepare('INSERT INTO checklist_items (checklist_id, text, position) VALUES (?, ?, ?)').bind(checklist.id, text, (max?.max_position ?? -1) + 1).run(); await env.DB.prepare("UPDATE checklists SET updated_at = datetime('now') WHERE id = ?").bind(checklist.id).run(); const item = await env.DB.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE id = ?').bind(result.meta.last_row_id).first<Item>(); return json(serializeItem(item!), 201) }
  const item = itemId ? await env.DB.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE id = ?').bind(itemId).first<Item>() : null
  if (!item || item.checklist_id !== checklist.id) return json({ error: 'item not found' }, 404)
  if (!action && method === 'DELETE') { await env.DB.batch([env.DB.prepare('DELETE FROM checklist_items WHERE id = ?').bind(item.id), env.DB.prepare("UPDATE checklists SET updated_at = datetime('now') WHERE id = ?").bind(checklist.id)]); return json({ ok: true }) }
  if (!action && method === 'PATCH') { const input = await body(request); if (typeof input.text === 'string') { const text = input.text.trim(); if (!text) return json({ error: 'item text cannot be empty' }, 400); if (text.length > ITEM_TEXT_MAX) return json({ error: `item text must be ${ITEM_TEXT_MAX} characters or fewer` }, 400); await env.DB.prepare('UPDATE checklist_items SET text = ? WHERE id = ?').bind(text, item.id).run() }; if (typeof input.checked === 'boolean') await env.DB.prepare('UPDATE checklist_items SET checked = ? WHERE id = ?').bind(input.checked ? 1 : 0, item.id).run(); await env.DB.prepare("UPDATE checklists SET updated_at = datetime('now') WHERE id = ?").bind(checklist.id).run(); const updated = await env.DB.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE id = ?').bind(item.id).first<Item>(); return json(serializeItem(updated!)) }
  if (action === 'move' && method === 'POST') { const input = await body(request), direction = asString(input.direction); if (direction !== 'up' && direction !== 'down') return json({ error: "direction must be 'up' or 'down'" }, 400); const items = await env.DB.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE checklist_id = ? ORDER BY position, id').bind(checklist.id).all<Item>(); const index = items.results.findIndex((candidate) => candidate.id === item.id), neighbor = items.results[index + (direction === 'up' ? -1 : 1)]; if (!neighbor) return json({ items: items.results.map(serializeItem) }); await env.DB.batch([env.DB.prepare('UPDATE checklist_items SET position = ? WHERE id = ?').bind(neighbor.position, item.id), env.DB.prepare('UPDATE checklist_items SET position = ? WHERE id = ?').bind(item.position, neighbor.id), env.DB.prepare("UPDATE checklists SET updated_at = datetime('now') WHERE id = ?").bind(checklist.id)]); const reordered = await env.DB.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE checklist_id = ? ORDER BY position, id').bind(checklist.id).all<Item>(); return json({ items: reordered.results.map(serializeItem) }) }
  return json({ error: 'not found' }, 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      try { return await api(request, env) } catch (error) { console.error(error); return json({ error: 'internal error' }, 500) }
    }
    return env.ASSETS.fetch(request)
  }
} satisfies ExportedHandler<Env>
