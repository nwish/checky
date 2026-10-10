import type Database from 'better-sqlite3'

export type Migration = {
  /** Strictly increasing, starting at 1. Stored in SQLite's `user_version` once applied. */
  version: number
  name: string
  up: (db: Database.Database) => void
}

/**
 * Schema migrations, applied automatically at startup (see migrate.ts), in order, each in its
 * own transaction. To change the schema, APPEND a migration with the next version number.
 *
 * Rules:
 * - Never edit or reorder a migration that has shipped; add a new one instead.
 * - Keep `up` self-contained. Don't import app code, and don't read anything that changes.
 * - Foreign keys are OFF while a migration runs (so tables can be rebuilt) and checked with
 *   `PRAGMA foreign_key_check` before it commits; a violation rolls the migration back.
 * - If `up` throws, the migration is rolled back and the app refuses to start rather than
 *   run on a half-migrated database. Before pending migrations run on an existing database,
 *   a copy is saved to data/backups/.
 * - SQLite can ADD a column, but a column's type, constraints or default can't be changed in
 *   place: create the new table, copy the rows, drop the old one, rename the new one.
 */
function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((c) => c.name === column)
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'baseline schema',
    // Every database from before versioned migrations has user_version 0, whatever shape it is
    // in, so this is idempotent: it creates what's missing and adds columns that older
    // databases lack, leaving existing data alone.
    up(db) {
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

        -- checklist_id NULL means "every list the owner has, now and in future".
        -- A list-specific row overrides the all-lists row for that list.
        CREATE TABLE IF NOT EXISTS checklist_shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          grantee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
          permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
          -- 'shared': the grantee runs the list with their own checks. 'collaborative': the
          -- grantee joins the owner's single live run (checks on checklist_items are common).
          mode TEXT NOT NULL DEFAULT 'collaborative' CHECK (mode IN ('shared', 'collaborative')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (owner_id <> grantee_id)
        );

        -- One row per completed run, written when a list with checked items is reset.
        -- title and the item snapshot are frozen so history survives later edits.
        CREATE TABLE IF NOT EXISTS checklist_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT NOT NULL DEFAULT (datetime('now')),
          total_items INTEGER NOT NULL,
          checked_items INTEGER NOT NULL,
          -- 1 for a run done on a user's own checks (shared mode); only that user sees it.
          personal INTEGER NOT NULL DEFAULT 0
        );

        -- A user's own checks on a list shared in 'shared' mode. Presence of a row = checked.
        CREATE TABLE IF NOT EXISTS item_checks (
          item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          PRIMARY KEY (item_id, user_id)
        );

        -- Start time of a user's current personal run, for duration (cf. checklists.run_started_at).
        CREATE TABLE IF NOT EXISTS personal_run_starts (
          checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (checklist_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS checklist_run_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id INTEGER NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          checked INTEGER NOT NULL,
          position INTEGER NOT NULL
        );

        -- Instance-wide admin settings. A missing key means the setting's default.
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)

      // Columns added over time to tables that older databases already have. Existing shares
      // keep their old behavior, where everyone sees the same checks, hence 'collaborative'.
      const columns: Array<[table: string, column: string, definition: string]> = [
        ['users', 'role', `TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'))`],
        ['users', 'invite_token_hash', 'TEXT'],
        ['users', 'invited_at', 'INTEGER'],
        ['users', 'activated_at', 'INTEGER'],
        ['checklists', 'icon', 'TEXT'],
        // Set when the first item is checked after a reset, so a run's duration can be measured.
        ['checklists', 'run_started_at', 'TEXT'],
        ['checklist_shares', 'mode', `TEXT NOT NULL DEFAULT 'collaborative' CHECK (mode IN ('shared', 'collaborative'))`],
        ['checklist_runs', 'personal', 'INTEGER NOT NULL DEFAULT 0']
      ]
      for (const [table, column, definition] of columns) {
        if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      }

      // Indexes last, since some cover columns that were only just added above.
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_token_hash);
        CREATE INDEX IF NOT EXISTS idx_checklists_user ON checklists(user_id);
        CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_shares_unique
          ON checklist_shares(owner_id, grantee_id, COALESCE(checklist_id, 0));
        CREATE INDEX IF NOT EXISTS idx_checklist_shares_grantee ON checklist_shares(grantee_id);
        CREATE INDEX IF NOT EXISTS idx_checklist_runs_checklist ON checklist_runs(checklist_id, completed_at);
        CREATE INDEX IF NOT EXISTS idx_checklist_run_items_run ON checklist_run_items(run_id);
      `)
    }
  },
  {
    version: 2,
    name: 'users.pass_hash nullable (pending invitations have no password yet)',
    // Databases created by the very first schema declared pass_hash NOT NULL, which makes
    // inviting anyone fail. SQLite can't relax a constraint in place, so rebuild the table.
    up(db) {
      const passHash = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string; notnull: number }>).find((c) => c.name === 'pass_hash')
      if (!passHash?.notnull) return
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          pass_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
          invite_token_hash TEXT,
          invited_at INTEGER,
          activated_at INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_new (id, email, pass_hash, role, invite_token_hash, invited_at, activated_at, created_at)
          SELECT id, email, pass_hash, role, invite_token_hash, invited_at, activated_at, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
        CREATE INDEX idx_users_invite ON users(invite_token_hash);
      `)
    }
  },
  {
    version: 3,
    name: 'user display name and avatar',
    up(db) {
      db.exec(`
        ALTER TABLE users ADD COLUMN display_name TEXT;
        ALTER TABLE users ADD COLUMN avatar TEXT;
      `)
    }
  },
  {
    version: 4,
    name: 'live run members (per-run collaboration on shared lists)',
    // Someone with a 'shared'-mode share runs the list on their own. The owner can invite them
    // into one live run of it: a row here is the invitation, joined_at is set once they accept,
    // and the rows go when that run ends (reset) or the owner ends it.
    up(db) {
      db.exec(`
        CREATE TABLE live_run_members (
          checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          invited_at TEXT NOT NULL DEFAULT (datetime('now')),
          joined_at TEXT,
          PRIMARY KEY (checklist_id, user_id)
        );
        CREATE INDEX idx_live_run_members_user ON live_run_members(user_id);
      `)
    }
  }
]
