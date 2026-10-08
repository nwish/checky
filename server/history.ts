import { Router } from 'express'
import { db } from './db.js'
import { requireAuth, type AuthedRequest } from './middleware.js'

const WEEKS = 12
const RECENT_RUNS = 50
const TOP_MISSED = 10
const DAY_MS = 24 * 60 * 60 * 1000

// Joins that resolve whether the user can see a run's list: they own it, or have a
// list-specific or all-lists share.
const RUN_JOINS = `
  JOIN checklists c ON c.id = r.checklist_id
  LEFT JOIN checklist_shares per ON per.grantee_id = @me AND per.checklist_id = c.id
  LEFT JOIN checklist_shares al ON al.grantee_id = @me AND al.owner_id = c.user_id AND al.checklist_id IS NULL`
// Common runs on lists the user takes part in (owns, or collaborates on), plus the user's own
// personal runs (shared mode). A shared-mode user isn't in the common run, so doesn't see it.
const RUN_VISIBLE = `((r.personal = 0 AND (c.user_id = @me OR COALESCE(per.mode, al.mode) = 'collaborative')) OR (r.personal = 1 AND r.user_id = @me))`
const VISIBLE_RUNS = `
  FROM checklist_runs r ${RUN_JOINS}
 WHERE ${RUN_VISIBLE}`
const LIST_FILTER = ` AND (@list IS NULL OR c.id = @list)`
const DURATION = `(julianday(r.completed_at) - julianday(r.started_at)) * 86400.0`

type Params = { me: number; list: number | null }

const statements = {
  lists: db.prepare(
    `SELECT c.id, c.title, COUNT(*) AS runs, MAX(r.completed_at) AS last_run,
            AVG(r.checked_items * 1.0 / r.total_items) AS avg_completion, AVG(${DURATION}) AS avg_duration
     ${VISIBLE_RUNS}
      GROUP BY c.id
      ORDER BY last_run DESC, c.id DESC`
  ),
  summary: db.prepare(
    `SELECT COUNT(*) AS runs, AVG(r.checked_items * 1.0 / r.total_items) AS avg_completion, AVG(${DURATION}) AS avg_duration
     ${VISIBLE_RUNS}${LIST_FILTER}`
  ),
  since: db.prepare(`SELECT r.completed_at ${VISIBLE_RUNS}${LIST_FILTER} AND r.completed_at >= @since`),
  missed: db.prepare(
    `SELECT c.id AS checklist_id, c.title AS list_title, ri.text,
            SUM(ri.checked = 0) AS missed, COUNT(*) AS appeared
       FROM checklist_run_items ri
       JOIN checklist_runs r ON r.id = ri.run_id ${RUN_JOINS}
      WHERE ${RUN_VISIBLE}${LIST_FILTER}
      GROUP BY c.id, ri.text
     HAVING missed > 0
      ORDER BY missed DESC, appeared DESC, ri.text
      LIMIT ${TOP_MISSED}`
  ),
  recent: db.prepare(
    `SELECT r.id, r.checklist_id, r.title, u.email AS by_email, r.completed_at, r.total_items, r.checked_items,
            ${DURATION} AS duration
     FROM checklist_runs r ${RUN_JOINS}
     LEFT JOIN users u ON u.id = r.user_id
    WHERE ${RUN_VISIBLE}${LIST_FILTER}
      ORDER BY r.completed_at DESC, r.id DESC
      LIMIT ${RECENT_RUNS}`
  ),
  missedForRun: db.prepare('SELECT text FROM checklist_run_items WHERE run_id = ? AND checked = 0 ORDER BY position, id')
}

/** SQLite's datetime('now') is UTC without a zone marker; make it unambiguous for clients. */
const iso = (value: string) => `${value.replace(' ', 'T')}Z`

/** Monday 00:00 UTC of the week containing `date`. */
function weekStart(date: Date): number {
  const day = (date.getUTCDay() + 6) % 7
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)
}

export const historyRouter = Router()
historyRouter.use(requireAuth)

historyRouter.get('/', (req, res) => {
  const me = (req as unknown as AuthedRequest).user
  const rawList = req.query.checklistId
  let list: number | null = null
  if (rawList !== undefined && rawList !== '') {
    list = Number(rawList)
    if (typeof rawList !== 'string' || !Number.isInteger(list)) {
      res.status(400).json({ error: 'invalid checklistId' })
      return
    }
  }
  const params: Params = { me: me.id, list }

  const lists = (statements.lists.all({ me: me.id }) as Array<{
    id: number
    title: string
    runs: number
    last_run: string
    avg_completion: number
    avg_duration: number | null
  }>).map((l) => ({
    id: l.id,
    title: l.title,
    runs: l.runs,
    lastRunAt: iso(l.last_run),
    avgCompletion: l.avg_completion,
    avgDurationSeconds: l.avg_duration === null ? null : Math.round(l.avg_duration)
  }))

  const s = statements.summary.get(params) as { runs: number; avg_completion: number | null; avg_duration: number | null }

  // Weekly buckets: the current (partial) week plus the previous WEEKS - 1, oldest first.
  const thisWeek = weekStart(new Date())
  const firstWeek = thisWeek - (WEEKS - 1) * 7 * DAY_MS
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({ weekStart: new Date(firstWeek + i * 7 * DAY_MS).toISOString().slice(0, 10), runs: 0 }))
  const sinceRows = statements.since.all({ ...params, since: new Date(firstWeek).toISOString().slice(0, 19).replace('T', ' ') }) as Array<{ completed_at: string }>
  const last30Cutoff = Date.now() - 30 * DAY_MS
  let last30Days = 0
  for (const { completed_at } of sinceRows) {
    const at = Date.parse(iso(completed_at))
    if (at >= last30Cutoff) last30Days++
    const bucket = Math.floor((weekStart(new Date(at)) - firstWeek) / (7 * DAY_MS))
    if (bucket >= 0 && bucket < WEEKS) weekly[bucket].runs++
  }

  const missed = (statements.missed.all(params) as Array<{ checklist_id: number; list_title: string; text: string; missed: number; appeared: number }>).map(
    (m) => ({ checklistId: m.checklist_id, listTitle: m.list_title, text: m.text, missed: m.missed, appeared: m.appeared })
  )

  const runs = (statements.recent.all(params) as Array<{
    id: number
    checklist_id: number
    title: string
    by_email: string | null
    completed_at: string
    total_items: number
    checked_items: number
    duration: number | null
  }>).map((r) => ({
    id: r.id,
    checklistId: r.checklist_id,
    title: r.title,
    by: r.by_email,
    completedAt: iso(r.completed_at),
    durationSeconds: r.duration === null ? null : Math.round(r.duration),
    total: r.total_items,
    checked: r.checked_items,
    missed: (statements.missedForRun.all(r.id) as Array<{ text: string }>).map((i) => i.text)
  }))

  res.json({
    lists,
    summary: {
      runs: s.runs,
      last30Days,
      avgCompletion: s.avg_completion,
      avgDurationSeconds: s.avg_duration === null ? null : Math.round(s.avg_duration)
    },
    weekly,
    missed,
    runs
  })
})
