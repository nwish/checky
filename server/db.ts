import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from './migrate.js'

// Emitted file lives in <root>/dist-server/, so one level up is the project root.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data')

mkdirSync(dataDir, { recursive: true })

export const db = new Database(join(dataDir, 'rerun.db'))

db.pragma('journal_mode = WAL')

// Create or upgrade the schema before anything else touches the database.
migrate(db, dataDir)
db.pragma('foreign_keys = ON')
