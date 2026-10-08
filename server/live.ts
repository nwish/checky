import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { resolveAccess } from './access.js'
import { db } from './db.js'
import { authenticate } from './middleware.js'

/**
 * Live collaborative runs. A client subscribes to a checklist it works on in the common run
 * (its owner, or a collaborator). The server only sends small notifications: `changed` (refetch
 * over HTTP), `presence` (who is subscribed), `left` (access or mode changed, or the list is
 * gone). Data and permissions stay on the HTTP API.
 *
 * client -> server: { type: 'subscribe' | 'unsubscribe', checklistId }
 * server -> client: { type: 'subscribed' | 'denied' | 'left', checklistId }
 *                   { type: 'changed', checklistId, origin? }
 *                   { type: 'presence', checklistId, users: string[] }
 */

type Client = { ws: WebSocket; userId: number; email: string; tokenHash: string; lists: Set<number>; alive: boolean }

const MAX_SUBSCRIPTIONS = 20
const HEARTBEAT_MS = 30_000
const clients = new Set<Client>()

const statements = {
  sessionValid: db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at >= ?'),
  listOwner: db.prepare('SELECT user_id FROM checklists WHERE id = ?')
}

function send(client: Client, message: object) {
  if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(message))
}

function broadcastPresence(listId: number) {
  const subscribed = [...clients].filter((c) => c.lists.has(listId))
  const users = [...new Set(subscribed.map((c) => c.email))].sort()
  for (const c of subscribed) send(c, { type: 'presence', checklistId: listId, users })
}

/**
 * Tells everyone in a list's common run that it changed. `origin` is the id of the browser tab
 * that made the change, so it can skip refetching its own edit. Subscribers who no longer take
 * part in the common run (share revoked, mode switched, list deleted) are dropped.
 */
export function notifyList(listId: number, origin?: string) {
  let dropped = false
  for (const c of clients) {
    if (!c.lists.has(listId)) continue
    if (resolveAccess(c.userId, listId)?.scope !== 'common') {
      c.lists.delete(listId)
      send(c, { type: 'left', checklistId: listId })
      dropped = true
    } else {
      send(c, { type: 'changed', checklistId: listId, origin })
    }
  }
  if (dropped) broadcastPresence(listId)
}

/** Re-checks every live list belonging to `ownerId`; call after that owner's shares change. */
export function notifyOwner(ownerId: number) {
  const subscribed = new Set([...clients].flatMap((c) => [...c.lists]))
  for (const listId of subscribed) {
    const row = statements.listOwner.get(listId) as { user_id: number } | undefined
    if (!row || row.user_id === ownerId) notifyList(listId)
  }
}

function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true // non-browser clients; they can't ride a victim's cookies
  try {
    const originHost = new URL(origin).host
    return originHost === host || (process.env.APP_URL !== undefined && originHost === new URL(process.env.APP_URL).host)
  } catch {
    return false
  }
}

export function attachLive(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/live') {
      socket.destroy()
      return
    }
    const session = originAllowed(req.headers.origin, req.headers.host) ? authenticate(req.headers) : null
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, userId: session.user.id, email: session.user.email, tokenHash: session.tokenHash, lists: new Set(), alive: true }
      clients.add(client)
      ws.on('pong', () => {
        client.alive = true
      })
      ws.on('message', (data) => onMessage(client, data.toString()))
      ws.on('close', () => {
        clients.delete(client)
        for (const listId of client.lists) broadcastPresence(listId)
      })
      ws.on('error', () => ws.terminate())
    })
  })

  // Drop dead connections and sockets whose session has ended (logout or expiry).
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive || !statements.sessionValid.get(c.tokenHash, Date.now())) {
        c.ws.terminate()
        continue
      }
      c.alive = false
      c.ws.ping()
    }
  }, HEARTBEAT_MS)
  server.on('close', () => clearInterval(heartbeat))
}

function onMessage(client: Client, raw: string) {
  let message: { type?: unknown; checklistId?: unknown }
  try {
    message = JSON.parse(raw)
  } catch {
    return
  }
  const listId = message?.checklistId
  if (typeof listId !== 'number' || !Number.isInteger(listId)) return

  if (message.type === 'subscribe') {
    const allowed = resolveAccess(client.userId, listId)?.scope === 'common' && (client.lists.has(listId) || client.lists.size < MAX_SUBSCRIPTIONS)
    if (!allowed) {
      send(client, { type: 'denied', checklistId: listId })
      return
    }
    client.lists.add(listId)
    send(client, { type: 'subscribed', checklistId: listId })
    broadcastPresence(listId)
  } else if (message.type === 'unsubscribe' && client.lists.delete(listId)) {
    broadcastPresence(listId)
  }
}
