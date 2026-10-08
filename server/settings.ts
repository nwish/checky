import { db } from './db.js'

const statements = {
  get: db.prepare('SELECT value FROM settings WHERE key = ?'),
  put: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
}

/** Whether anyone may create an account without an invitation. Closed unless an admin opens it. */
export function isRegistrationOpen(): boolean {
  return (statements.get.get('registration_open') as { value: string } | undefined)?.value === '1'
}

export function setRegistrationOpen(open: boolean) {
  statements.put.run('registration_open', open ? '1' : '0')
}
