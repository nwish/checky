# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individuals who do the same activity repeatedly (kayaking, road trips, campouts, yard work, and similar) and want a checklist that resets cleanly for next time. The product supports multiple accounts on one self-hosted instance (e.g. household members sharing an install), but each user's checklists are personal and private to them — not shared or collaborative between accounts.

## Product Purpose

Turns a repeatable activity into a checklist: build it once, run through it top-to-bottom when it's time, reset it, and it's ready for next time. Currently at the foundation stage — auth, admin invites, and the app shell (dashboard + admin nav) are built; the checklist-building/running feature itself is not yet implemented (dashboard shows an honest "coming soon" empty state).

## Positioning

Local-first and self-hosted: everything lives in a single SQLite file on the user's own machine, with no cloud account, no sync, and no subscription. The differentiator against generic cloud to-do apps (Todoist, Notion, etc.) is this local-first ownership combined with a reset-and-reuse mechanic purpose-built for repeatable activities, rather than one-off tasks.

## Operating Context

- Self-hosted: run via `npm run dev` / `npm start`, or Docker Compose; data persists in a local SQLite file (`data/checky.db`).
- The first registered account becomes admin; after that, registration closes (`403`) and new users join only via admin-issued email invites (single-use activation link).
- Admin panel (role-gated) manages invites and lists members/pending invites; inviting an already-invited email rotates the link and resends.
- Invitation email delivery is optional (`SMTP_*` env vars); without SMTP configured, invite links are logged to the server console instead of emailed.
- Deployable behind a TLS reverse proxy (`HTTPS=1` sets the `Secure` cookie flag).

## Capabilities and Constraints

- Confirmed: email/password auth (PBKDF2-HMAC-SHA256, 600k iterations), server-side sessions (SQLite-backed, 30-day expiry, HttpOnly cookie), admin-role invite system, per-IP+email rate limiting, timing-safe login (unknown-email logins burn a dummy hash).
- Confirmed: each user's checklists are personal/private — no sharing or collaboration between accounts.
- Not yet built: the checklist feature itself (creating, running, and resetting checklists).
- Constraint: local-only storage; no cloud sync, no multi-device sync beyond hosting the instance somewhere the user's own devices can reach.

## Brand Commitments

- Name: Checky. Logo: a rounded-square gradient mark (violet → cyan) with a white checkmark, used as favicon and nav-brand icon.
- Visual identity: dark theme with a violet/cyan gradient accent (`src/index.css` design tokens: `--accent #7c6cff`, `--accent-2 #22d3ee`).
- Tone: plain and utilitarian, no marketing embellishment (e.g. README's direct, matter-of-fact copy; UI copy like "Foundation ready").

## Evidence on Hand

None. No real customer testimonials, usage data, case studies, or press exist yet; future work must not fabricate them.

## Product Principles

1. Local-first: user data never leaves their own machine/instance; no cloud dependency is ever assumed.
2. Repeatable, not one-off: checklists are built once and reset for reuse, distinct from single-use to-do items.
3. Personal, not collaborative: each account's checklists are private; multi-account exists for shared hosting, not shared lists.
4. Invitation-gated growth: after the first account, new users are admin-controlled, not open registration.
5. Honest incompleteness: unfinished features (like the checklist workspace) are shown as clearly-labeled "coming soon" states, never faked.

## Accessibility & Inclusion

No product-specific requirement established.
