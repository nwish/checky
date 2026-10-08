import type Database from 'better-sqlite3'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { migrations, type Migration } from './migrations.js'

const KEEP_BACKUPS = 5

/**
 * Brings the database up to the latest schema. Runs at startup, before the app serves anything:
 * pending migrations apply in order, each in its own transaction, and the schema version is
 * stored in SQLite's `user_version`. Anything that goes wrong throws, which stops the app from
 * starting rather than letting it run on a half-migrated database.
 */
export function migrate(db: Database.Database, dataDir: string, list: Migration[] = migrations) {
  list.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`migrations must be numbered 1, 2, 3, … in order; found v${m.version} at position ${i + 1}`)
  })

  const latest = list.length
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > latest) {
    throw new Error(`the database is at schema v${current}, newer than the v${latest} this version of Rerun knows; refusing to start (was it used by a newer version?)`)
  }
  if (current === latest) return

  // A database that already has tables holds data worth protecting; a brand-new one doesn't.
  const hasData = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1").get() !== undefined
  if (hasData) {
    const backup = backupDatabase(db, dataDir, current, latest)
    console.log('[db] migrating schema v%d -> v%d (backup: %s)', current, latest, backup)
  }

  for (const m of list.filter((candidate) => candidate.version > current)) apply(db, m)
  console.log('[db] schema is at v%d', latest)
}

function foreignKeyViolations(db: Database.Database): number {
  return (db.pragma('foreign_key_check') as unknown[]).length
}

function apply(db: Database.Database, m: Migration) {
  // Foreign keys must be off while tables are rebuilt; this can't be changed inside a transaction.
  db.pragma('foreign_keys = OFF')
  const violationsBefore = foreignKeyViolations(db)
  try {
    db.transaction(() => {
      // Re-read under the write lock, in case another process migrated first.
      if ((db.pragma('user_version', { simple: true }) as number) >= m.version) return
      m.up(db)
      // Only violations this migration introduced count; it isn't blamed for pre-existing ones.
      if (foreignKeyViolations(db) > violationsBefore) throw new Error('it left foreign key violations')
      db.pragma(`user_version = ${m.version}`)
    }).immediate()
  } catch (err) {
    throw new Error(`migration v${m.version} (${m.name}) failed and was rolled back: ${(err as Error).message}`, { cause: err })
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

/** Saves a consistent copy of the database to data/backups/ and keeps only the newest few. */
function backupDatabase(db: Database.Database, dataDir: string, from: number, to: number): string {
  const dir = join(dataDir, 'backups')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 18)
  const file = join(dir, `rerun-v${from}-to-v${to}-${stamp}.db`)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)

  const backups = readdirSync(dir)
    .filter((name) => name.startsWith('rerun-v') && name.endsWith('.db'))
    .map((name) => ({ path: join(dir, name), modified: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified)
  for (const old of backups.slice(KEEP_BACKUPS)) rmSync(old.path)
  return file
}
