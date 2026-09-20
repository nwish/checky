import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Emitted file lives in <root>/dist-server/, so one level up is the project root.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data')

mkdirSync(dataDir, { recursive: true })

export const db = new Database(join(dataDir, 'checky.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    invite_token_hash TEXT,
    invited_at INTEGER,
    activated_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_token_hash);

  CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    icon TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_checklists_user ON checklists(user_id);
  CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id);
`)

// Migrate databases created before roles/invites existed.
const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
const names = new Set(columns.map((c) => c.name))
if (!names.has('role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'))`)
}
if (!names.has('invite_token_hash')) db.exec('ALTER TABLE users ADD COLUMN invite_token_hash TEXT')
if (!names.has('invited_at')) db.exec('ALTER TABLE users ADD COLUMN invited_at INTEGER')
if (!names.has('activated_at')) db.exec('ALTER TABLE users ADD COLUMN activated_at INTEGER')

// Migrate checklists created before icons existed.
const checklistColumns = db.prepare('PRAGMA table_info(checklists)').all() as Array<{ name: string }>
if (!checklistColumns.some((c) => c.name === 'icon')) {
  db.exec('ALTER TABLE checklists ADD COLUMN icon TEXT')
}
