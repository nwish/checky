# Rerun

Rerun turns repeatable activities into checklists. Build a list for each thing you do more than once — kayaking, road trips, campouts, yard work — then keep it exactly the way you want it.

Going kayaking? Open the kayaking list, run through it top to bottom, and go kayaking. Reset the list and it's ready for next time.

Local and self-hosted: everything lives on your machine in a SQLite file. No cloud account, no sync, no subscription.

Current state: foundation — secure user/pass auth is working; the checklist features are next.

## Stack

| Layer     | Tech                                                        |
| --------- | ----------------------------------------------------------- |
| Backend   | Node.js, Express 4, TypeScript (ESM)                         |
| Frontend  | React 18, Vite, TypeScript                                   |
| Database  | SQLite via `better-sqlite3` (WAL mode)                       |
| Auth      | PBKDF2 password hashing, server-side sessions in SQLite      |

## Requirements

- Node.js **≥ 22.12** (24 recommended) and npm

## Quickstart (development)

```bash
npm install
npm run dev
```

- App: http://127.0.0.1:5173
- API:  http://127.0.0.1:3001 (the Vite dev server proxies `/api/*` here)

Both servers run under one command (`concurrently`); `api` runs in watch mode.

**First account:** none is seeded. Open the app → "No account? Create one" → register. That account is yours.

## Scripts

| Script                | What it does                                        |
| --------------------- | --------------------------------------------------- |
| `npm run dev`         | API (watch mode) + Vite dev server together         |
| `npm run dev:api`     | API only (http://127.0.0.1:3001)                    |
| `npm run dev:web`     | Vite dev server only (http://127.0.0.1:5173)        |
| `npm run build`       | Build the frontend to `dist/` (API runs TS directly) |
| `npm start`           | Production: Express serves the built UI + API       |
| `npm run typecheck`   | Type-check the frontend without emitting            |

## Production

```bash
npm run build
npm start        # serves UI and API on http://127.0.0.1:3001
```

## Configuration (env vars)

| Var        | Default     | Notes                                  |
| ---------- | ----------- | -------------------------------------- |
| `PORT`     | `3001`      | API port                               |
| `HOST`     | `127.0.0.1` | Bind address; set `0.0.0.0` to expose  |
| `NODE_ENV` | —         | `production` serves the built UI      |
| `HTTPS`    | —         | `1` adds the `Secure` flag to the session cookie — set only when served over TLS (reverse proxy, etc.) |
| `SMTP_HOST` | —        | SMTP server for invitation emails (e.g. `smtp.fastmail.com`). Unset: emails are logged to the server console instead of sent |
| `SMTP_PORT` | `587`    | SMTP port |
| `SMTP_SECURE` | —      | `1` for implicit TLS (port 465); default uses STARTTLS |
| `SMTP_USER` | —        | SMTP auth user (optional; some relays need no auth) |
| `SMTP_PASS` | —        | SMTP auth password |
| `SMTP_FROM` | `Rerun <rerun@localhost>` | From address for emails |
| `APP_URL`   | request origin | Base URL used in invitation links when the email is sent |

The server reads a `.env` file from the repo root when present — create it from `.env.example`. Values in a real environment always take precedence over the file.

## Deployment (Docker)

```bash
docker compose up -d --build
```

- App: http://localhost:3001 (UI + API in one container)
- SQLite persists in the `rerun-data` named volume (`/app/data`)
- Healthcheck: `GET /api/health`
- Behind a TLS reverse proxy: uncomment the `HTTPS=1` env in `docker-compose.yml`
- First account: same as above — register via the UI (it becomes the admin)
  - Invitation emails need the `SMTP_*` env vars (see Configuration); without them the email is logged to the container's console

## Accounts & invitations

- The **first** account registered becomes the **admin**. After that, registration closes (`403`) — new users are added by invitation.
- An admin invites by email; the invitee gets a single-use link to set their password. Inviting an email that was already sent (but not yet activated) rotates the link and resends.
- Invited users can sign in only after activating via the link.
- The admin panel (visible to `role: admin` only) shows members, pending invites, and the invite form.

## Sharing

- Owners share with existing, activated users by email, from the Checklists page: either **Share all lists** (live — includes lists created later) or **Share this list** on a single list.
- Each share is **Can view** (read-only) or **Can edit** (check/uncheck, add, edit, reorder, delete items, reset). Renaming, changing the icon, deleting a list, and managing shares stay owner-only.
- A list-specific share overrides the owner's share-all for that person, so you can share everything as edit but one list as view-only.
- Checked state lives on the items, so it is shared: if someone with edit access checks an item, everyone sees it checked.
- Shared lists appear on the Dashboard and Checklists page labelled with the owner. Revoking a share removes access immediately; deleting a list or account removes its shares.
- API: `GET /api/shares`, `PUT /api/shares` (`{ email, permission, checklistId? }`; omit `checklistId` for all lists), `DELETE /api/shares/:id`. Lists and list detail include `access` (`owner` | `edit` | `view`) and `ownerEmail`. Unshared lists return `404`; insufficient access returns `403`.
- The share endpoint reveals whether an email belongs to an active account (needed for a usable UI), so it is limited to 60 requests / 15 min per IP.

## Duplicating lists

- **Duplicate** (on each list's card, Checklists page) copies a list into a new list you own, titled "<title> (copy)", with the same icon and items, all unchecked. Shares are not copied.
- You can duplicate any list you can see, including view-only lists shared with you — the copy is yours to edit. API: `POST /api/checklists/:id/duplicate` (`404` if the list isn't visible to you).

## Run history & analytics

- **Reset records a run.** Resetting a list that has at least one checked item saves a run first: which items were checked or missed, who reset it, when, and how long it took (from the first check after the previous reset). Resetting with nothing checked records nothing.
- The **History** page shows runs per week (last 12 weeks), runs in the last 30 days, average share of items checked, average time, the items you miss most often, a per-list breakdown (click a list to filter), and the latest 50 runs with the items that weren't checked.
- History covers lists you own and lists shared with you; shared runs show who did them. Runs keep the list title and item text as they were at reset, so later edits don't rewrite history. Deleting a list deletes its runs.
- Runs are only recorded from now on; earlier resets can't be reconstructed. API: `GET /api/history[?checklistId=]`.

## Auth & security notes

- Passwords: PBKDF2-HMAC-SHA256, 600,000 iterations, per-user 16-byte random salt, stored as `pbkdf2-sha256$<iter>$<salt>$<hash>`.
- Sessions: 256-bit random token; only its SHA-256 hash is stored (with 30-day expiry); token delivered in an `HttpOnly`, `SameSite=Lax` cookie (`rerun_session`).
- Login never reveals whether an email exists, and unknown-email logins burn a dummy hash so timing stays uniform.
- Invite links: 256-bit single-use token; only its SHA-256 hash is stored; consumed on activation or rotated on resend.
- Rate limiting (in-memory, per IP+email): 5 logins / 5 min, 10 registrations / 15 min, 10 invites / 15 min, 5 activations per link / 5 min.
- JSON body limit 16 KB; malformed bodies get a generic 400.

## Data & reset

- Database: `data/rerun.db` (gitignored).
- Reset everything: stop the app, delete the `data/` directory, restart.

## Project layout

```
├── server/          Express API (auth, sessions, rate limiting)
│   ├── index.ts     app + routes
│   ├── auth.ts      PBKDF2 hashing, session tokens
│   ├── db.ts        SQLite connection + schema
│   ├── mail.ts      SMTP (or console) delivery for invites
│   ├── ratelimit.ts in-memory attempt limiter
│   ├── checklists.ts checklist + item routes with access checks
│   ├── shares.ts    per-list / all-lists sharing routes
│   └── history.ts   run history + analytics route
├── src/             React app
│   ├── App.tsx      shell + auth screens
│   ├── api.ts       fetch client for /api
│   └── index.css    dark theme (CSS variables)
├── index.html
├── vite.config.ts   dev proxy /api -> :3001
└── data/            SQLite files (created at runtime)
```

## Development notes

- Frontend TS is checked with `npm run typecheck`; Vite transpiles via esbuild (no type emit).
- The dark theme lives in CSS variables at the top of `src/index.css` — tweak `--bg`, `--accent`, etc. there.
- The API listens on `3001` by default because `3000` was occupied on this machine; use `PORT=… npm start` (or `dev`) to pick another.
