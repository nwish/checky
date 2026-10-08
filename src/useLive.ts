import { useEffect, useRef, useState } from 'react'
import { clientId, type Person } from './api'

type Handlers = {
  /** Someone else changed the list, or the socket reconnected after a gap: refetch it. */
  onChanged: () => void
  /** You're no longer in this live run (share revoked, mode switched, list deleted). */
  onLeft: () => void
}

/**
 * Joins a list's live run over a websocket and returns the emails currently in it (including
 * your own). Pass null to stay disconnected. Reconnects with backoff and asks for a refetch
 * whenever it comes back, since updates may have been missed.
 */
export function useLiveRun(checklistId: number | null, handlers: Handlers): Person[] {
  const [users, setUsers] = useState<Person[]>([])
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    setUsers([])
    if (checklistId === null) return

    let ws: WebSocket | null = null
    let retryTimer: number | undefined
    let failures = 0
    let connectedBefore = false
    let stopped = false

    const connect = () => {
      ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/live`)
      ws.onopen = () => {
        failures = 0
        ws?.send(JSON.stringify({ type: 'subscribe', checklistId }))
        if (connectedBefore) latest.current.onChanged()
        connectedBefore = true
      }
      ws.onmessage = (event) => {
        let message: { type?: string; checklistId?: number; origin?: string; users?: Person[] }
        try {
          message = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (message.checklistId !== checklistId) return
        if (message.type === 'presence' && Array.isArray(message.users)) setUsers(message.users)
        else if (message.type === 'changed' && message.origin !== clientId) latest.current.onChanged()
        else if (message.type === 'left') {
          setUsers([])
          latest.current.onLeft()
        }
      }
      ws.onclose = () => {
        setUsers([])
        if (!stopped) retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** failures++, 15000))
      }
    }
    connect()

    return () => {
      stopped = true
      window.clearTimeout(retryTimer)
      ws?.close()
    }
  }, [checklistId])

  return users
}
