# Checky

Local, self-hosted checklist app. Node + TypeScript backend (Express), React frontend (Vite), SQLite storage.

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
| `NODE_ENV` | —           | `production` enables `Secure` cookies  |

## API

All routes are JSON under `/api`:

| Method | Route               | Auth   | Description                          |
| ------ | ------------------- | ------ | ------------------------------------ |
| GET    | `/api/health`       | —      | Liveness probe                       |
| POST   | `/api/auth/register`| —      | Create account `{ email, password }` |
| POST   | `/api/auth/login`   | —      | Sign in                              |
| POST   | `/api/auth/logout`  | cookie | End session                          |
| GET    | `/api/auth/me`      | cookie | Current user `{ email }`              |

## Auth & security notes

- Passwords: PBKDF2-HMAC-SHA256, 600,000 iterations, per-user 16-byte random salt, stored as `pbkdf2-sha256$<iter>$<salt>$<hash>`.
- Sessions: 256-bit random token; only its SHA-256 hash is stored (with 30-day expiry); token delivered in an `HttpOnly`, `SameSite=Lax` cookie (`checky_session`).
- Login never reveals whether an email exists, and unknown-email logins burn a dummy hash so timing stays uniform.
- Rate limiting (in-memory, per IP+email): 5 logins / 5 min, 10 registrations / 15 min.
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
