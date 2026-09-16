# Checky

Local, self-hosted checklist app. Node + TypeScript backend (Express), React frontend (Vite), SQLite storage.

Current state: foundation — secure user/pass auth is working; the checklist features are next.

This is really just a low-risk test of Qwen 3.8 to see how well it builds a complete app!

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
| `SMTP_FROM` | `Checky <checky@localhost>` | From address for emails |
| `APP_URL`   | request origin | Base URL used in invitation links when the email is sent |

The server reads a `.env` file from the repo root when present — create it from `.env.example`. Values in a real environment always take precedence over the file.

## Deployment (Docker)

```bash
docker compose up -d --build
```

- App: http://localhost:3001 (UI + API in one container)
- SQLite persists in the `checky-data` named volume (`/app/data`)
- Healthcheck: `GET /api/health`
- Behind a TLS reverse proxy: uncomment the `HTTPS=1` env in `docker-compose.yml`
- First account: same as above — register via the UI (it becomes the admin)
- Invitation emails need the `SMTP_*` env vars (see Configuration); without them the email is logged to the container's console

## Accounts & invitations

- The **first** account registered becomes the **admin**. After that, registration closes (`403`) — new users are added by invitation.
- An admin invites by email; the invitee gets a single-use link to set their password. Inviting an email that was already sent (but not yet activated) rotates the link and resends.
- Invited users can sign in only after activating via the link.
- The admin panel (visible to `role: admin` only) shows members, pending invites, and the invite form.

## API

All routes are JSON under `/api`:

| Method | Route               | Auth   | Description                          |
| ------ | ------------------- | ------ | ------------------------------------ |
| GET    | `/api/health`       | —      | Liveness probe                       |
| POST   | `/api/auth/register`| —      | Create the **first** account (becomes admin) `{ email, password }`; `403` once any account exists |
| POST   | `/api/auth/login`   | —      | Sign in                              |
| POST   | `/api/auth/logout`  | cookie | End session                          |
| GET    | `/api/auth/me`      | cookie | Current user `{ email, role }` |
| POST   | `/api/auth/activate`| link   | Set password with single-use invite `{ token, password }` |
| POST   | `/api/admin/invites`| admin  | Invite `{ email }` (or resend) |
| GET    | `/api/admin/users`  | admin  | List users + activation state |

## Auth & security notes

- Passwords: PBKDF2-HMAC-SHA256, 600,000 iterations, per-user 16-byte random salt, stored as `pbkdf2-sha256$<iter>$<salt>$<hash>`.
- Sessions: 256-bit random token; only its SHA-256 hash is stored (with 30-day expiry); token delivered in an `HttpOnly`, `SameSite=Lax` cookie (`checky_session`).
- Login never reveals whether an email exists, and unknown-email logins burn a dummy hash so timing stays uniform.
- Invite links: 256-bit single-use token; only its SHA-256 hash is stored; consumed on activation or rotated on resend.
- Rate limiting (in-memory, per IP+email): 5 logins / 5 min, 10 registrations / 15 min, 10 invites / 15 min, 5 activations per link / 5 min.
- JSON body limit 16 KB; malformed bodies get a generic 400.

## Data & reset

- Database: `data/checky.db` (gitignored).
- Reset everything: stop the app, delete the `data/` directory, restart.

## Project layout

```
├── server/          Express API (auth, sessions, rate limiting)
│   ├── index.ts     app + routes
│   ├── auth.ts      PBKDF2 hashing, session tokens
│   ├── db.ts        SQLite connection + schema
│   ├── mail.ts      SMTP (or console) delivery for invites
│   └── ratelimit.ts in-memory attempt limiter
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
