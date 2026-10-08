import { db } from './db.js'

export type Access = 'owner' | 'edit' | 'view'
/**
 * Whose checks a user sees and changes on a list: 'common' is the single run on the
 * list's items (the owner's, joined live by collaborators); 'personal' is the user's own.
 */
export type Scope = 'common' | 'personal'

export const ACCESS_RANK: Record<Access, number> = { view: 1, edit: 2, owner: 3 }

const statements = {
  owner: db.prepare('SELECT user_id FROM checklists WHERE id = ?'),
  // A list-specific share beats the owner's all-lists share (checklist_id IS NULL sorts last).
  share: db.prepare(
    `SELECT permission, mode FROM checklist_shares
      WHERE grantee_id = @me AND (checklist_id = @id OR (owner_id = @owner AND checklist_id IS NULL))
      ORDER BY checklist_id IS NULL
      LIMIT 1`
  )
}

/** The user's access to a checklist and which checks they work on, or null when it isn't visible to them. */
export function resolveAccess(userId: number, checklistId: number): { access: Access; scope: Scope; ownerId: number } | null {
  const row = statements.owner.get(checklistId) as { user_id: number } | undefined
  if (!row) return null
  if (row.user_id === userId) return { access: 'owner', scope: 'common', ownerId: row.user_id }
  const share = statements.share.get({ me: userId, id: checklistId, owner: row.user_id }) as { permission: 'view' | 'edit'; mode: 'shared' | 'collaborative' } | undefined
  if (!share) return null
  return { access: share.permission, scope: share.mode === 'collaborative' ? 'common' : 'personal', ownerId: row.user_id }
}
