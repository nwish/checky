---
name: Checky
description: A self-hosted checklist app styled as a creator's desk instrument — gunmetal chassis, keycap controls, one orange action key.
colors:
  chassis: "#1a1b1e"
  panel: "#232529"
  key: "#2c2e33"
  key-hover: "#34363c"
  key-border: "#3d4046"
  key-border-strong: "#4c4f57"
  ink: "#eae6dc"
  legend: "#b6ac99"
  dim: "#919398"
  action: "#ff5a1f"
  action-hover: "#ff7642"
  action-ink: "#1c0d04"
  status: "#ffb020"
  success: "#7fb069"
  danger: "#e66b60"
  focus: "#cfd3da"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontWeight: 500
    letterSpacing: "0.03em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.key}"
    textColor: "{colors.legend}"
    rounded: "{rounded.sm}"
  nav-link:
    backgroundColor: "{colors.key}"
    textColor: "{colors.legend}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  nav-link-active:
    backgroundColor: "{colors.key-hover}"
    textColor: "{colors.ink}"
---

# Design System: Checky

## Overview

**Creative North Star: "The Action Key"**

Checky reads as a piece of equipment you own, not a cloud dashboard: a gunmetal desk instrument with keycap controls and exactly one confident orange key. Every clickable surface — buttons, nav items, list rows — behaves like a real key: it rests with depth, lifts under the pointer, and depresses on press. The system was chosen deliberately against the "purple gradient on dark slate" look that reads as generic AI-scaffolded software; there is no gradient anywhere in the system, on text or otherwise, and the single accent color is spent on exactly one thing per screen: the primary action.

Two accent colors carry all meaning in this system, and they never trade places. Safety-orange (`--action`) means "the one thing to do here" — a primary submit button, the active nav item, the brand checkmark. Amber (`--status`) means "a live reading" — the admin status-readout digits, a pending-invite badge. A static role label, a decorative icon, or a focus ring never borrows either color; they stay in the neutral ink/legend/dim scale. Diluting either reservation is the single fastest way to make this system stop reading as an instrument and start reading as decoration.

**Key Characteristics:**
- Gunmetal chassis and panel surfaces; keycap chips lift off them, never the reverse.
- Exactly one orange action color, reserved for primary actions and the active nav state.
- Amber reserved for live status readouts and pending states — never a generic focus or accent color.
- Three self-hosted type families with distinct jobs: Space Grotesk (display), IBM Plex Sans (body), IBM Plex Mono (labels, legends, data, emails).
- Every interactive element has three real states: rest (soft offset+blur shadow), hover (lift), press (collapse + translateY). No control opts out of this to save time.
- No gradients, no glass/blur decoration, no purple.

## Colors

The palette is a dark gunmetal chassis with warm bone-colored ink and two disciplined accents; nothing in the system is decorative-only.

### Primary
- **Action Orange** (`#ff5a1f`): the one confident accent. Primary buttons, the active/selected nav item's ring and icon, the brand checkmark. Never used for a static label, a badge, or an illustration.

### Secondary
- **Status Amber** (`#ffb020`): live readings only. The admin status-readout digits, pending-invite badges and avatars. Never used as a generic focus color or a decorative accent.

### Neutral
- **Chassis** (`#1a1b1e`): page background.
- **Panel** (`#232529`): raised surfaces — sidebar, cards, the status-readout container.
- **Key** (`#2c2e33`) / **Key Hover** (`#34363c`): the resting/hover surface of every button, nav item, and list row.
- **Key Border** (`#3d4046`) / **Key Border Strong** (`#4c4f57`): hairline edges on keys and avatar chips.
- **Ink** (`#eae6dc`): primary text — warm off-white, never pure white.
- **Legend** (`#b6ac99`): secondary text and labels — the "bone/putty keycap legend" tint.
- **Dim** (`#919398`): tertiary/muted text (tuned to hold ≥4.5:1 on panel surfaces).
- **Danger** (`#e66b60`): error text (tuned to hold ≥4.5:1 on panel surfaces).
- **Success** (`#7fb069`): confirmation text.
- **Focus** (`#cfd3da`): the neutral focus-visible ring — deliberately distinct from both accents so focus never reads as "primary action" or "live status."

### Named Rules
**The One Voice Rule.** Action Orange marks exactly one thing per screen: the primary action or the active nav item. If a second element on the same screen wants orange, it is either not actually primary, or the screen has two primaries and needs to pick one.

**The Amber-Means-Live Rule.** Amber never appears on anything static. If it's not a number that changes or a state that's actually pending, it isn't amber.

## Typography

**Display Font:** Space Grotesk (with system-ui fallback)
**Body Font:** IBM Plex Sans (with system-ui fallback)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace fallback)

All three are self-hosted via `@fontsource` packages — no font CDN — matching the product's local-first, no-cloud-dependency positioning.

**Character:** Space Grotesk's slightly mechanical geometry carries the instrument-panel headings; IBM Plex Sans reads clean and human for body copy; IBM Plex Mono does the "dye-sublimated keycap legend" job — nav labels, badges, emails, numeric readouts — everywhere the system wants to feel measured and labeled rather than written.

### Hierarchy
- **Display** (600, 1.2–1.6rem, Space Grotesk): page titles (`h1`), card headings (`h2`).
- **Body** (400–500, 0.95rem, IBM Plex Sans): paragraphs, form copy, button labels.
- **Label** (500, 0.66–0.85rem, IBM Plex Mono, uppercase, 0.03–0.06em tracking): nav items, form labels, badges, status-readout values/labels, user emails, timestamps.

### Named Rules
**The Legend Rule.** Anything that names or measures something (a nav destination, a badge, an email, a count) is set in IBM Plex Mono, uppercase, letter-spaced — like a keycap's printed legend. Anything that explains or persuades (paragraphs, headings) is not.

## Layout

Two-region app shell: a fixed 260px gunmetal sidebar (logo, nav keys, spacer, user key) and a fluid main content column (max-width 1100px, 32–40px padding). Below 860px the sidebar collapses to a horizontal bar with wrapping nav keys; below 640px the admin status-readout stacks vertically instead of squeezing three segments horizontally. Every flex/grid container that holds user-generated text (emails, labels) carries `min-width: 0` on its children so text wraps or truncates instead of forcing page-level horizontal overflow — this was a real defect found and fixed during the build.

## Elevation & Depth

Structural, state-driven — never ambient decoration. Every interactive surface has exactly three shadow states tied to interaction, not mood lighting: rest (a soft offset+blur shadow, like a keycap sitting at height), hover (deeper offset+blur plus a 1px lift), press (the shadow collapses and the element moves down 1px). A surface that doesn't respond to the pointer doesn't get a shadow at all.

### Shadow Vocabulary
- **Key Rest** (`0 1px 0 rgba(0,0,0,.6), 0 6px 14px -5px rgba(0,0,0,.55)`): default state for buttons, nav items, list rows, avatar chips.
- **Key Hover** (`0 1px 0 rgba(0,0,0,.6), 0 10px 20px -6px rgba(0,0,0,.6)`): paired with `translateY(-1px)`.
- **Key Pressed** (`0 6px 10px -6px rgba(0,0,0,.5)`): paired with `translateY(1px)`; the shadow collapses because the key traveled down.
- **Panel** (`0 2px 14px -6px rgba(0,0,0,.55)`): static elevation for cards and panels that don't themselves respond to the pointer.

### Named Rules
**The Every Key Rule.** Every clickable element gets all three shadow states. A control that only has a hover effect, or only a flat click with no depth, is unfinished — this was flagged and fixed for the sign-out button and the login/register mode-toggle during the build's finish review.

## Shapes

Corners are barely rounded (6/10/14px) — keycaps have a slight bevel, not a soft-app pill radius. Nothing in the system uses a fully rounded (pill) shape except the `.badge` corner treatment, which stays sharp-cornered too (`rounded-sm`), and the round-only exception is the circular scrollbar thumb. Avatar chips are rounded squares, not circles — a keycap shape, not a social-app avatar shape. Pending-state elements (avatars, badges) use a dashed border instead of a different shape to signal "not yet confirmed."

## Components

### Buttons
- **Shape:** 6px radius, 1px border.
- **Primary** (`button`): Action Orange background, near-black ink text, 10px/16px padding. This is the one confident key on the screen.
- **Secondary** (`button.ghost`, `button.link`): neutral key surface (`--key` background, `--legend` text) — same rest/hover/press depth as primary, just visually quiet.
- **Hover / Press:** all buttons lift on hover (`translateY(-1px)` + deeper shadow) and depress on press (`translateY(1px)` + collapsed shadow). Disabled buttons keep the rest shadow but drop to 55% opacity and lose the hover/press motion.

### Cards / Panels
- **Corner Style:** 10–14px radius.
- **Background:** `--panel` (#232529).
- **Shadow Strategy:** static `--shadow-panel`, not the interactive key shadows (panels aren't clickable).
- **Border:** 1px `--key-border`.
- **Internal Padding:** 28px (auth cards), 14–20px (admin sections).

### Inputs
- **Style:** recessed well — `--chassis` background (darker than its parent panel) with an inset shadow, 1px `--key-border`, 6px radius. Reads as "pressed into the chassis," the opposite of a raised key.
- **Focus:** 2px `--focus` outline (neutral, never orange or amber).
- **Labels:** IBM Plex Mono, uppercase, `--legend` color, above the field.

### Navigation
- **Style:** each nav item is a full-width keycap: `--key` background, mono uppercase label, left-aligned icon, rest/hover/press shadow states.
- **Active state:** `--key-hover` background, an orange-tinted border and inset ring (not a colored border-stripe), orange icon tint — reads as "this key is currently down," not merely highlighted.
- **Mobile:** the sidebar becomes a horizontal wrapping bar below 860px; nav items keep their full key treatment.

### Status Readout (signature component)
One continuous panel divided into hairline-separated segments (not repeated hero-metric cards) — each segment an amber (`--status`) tabular-mono number over a small uppercase mono label. Reads as a single instrument's multi-digit display, not three identical dashboard widgets. Stacks vertically below 640px.

### User / List Rows
- **Style:** each row is a quiet keycap (`--key` background, rest shadow only — no hover/press, since rows aren't currently clickable as a whole) holding a rounded-square mono-initials avatar, stacked email/date in `--legend`/`--dim`, and a role or status badge.
- **Pending state:** dashed amber avatar border + amber "PENDING" badge + a secondary "Resend" key.

## Do's and Don'ts

### Do:
- **Do** reserve Action Orange (`#ff5a1f`) for exactly one primary action or the active nav item per screen.
- **Do** reserve Status Amber (`#ffb020`) for live readouts and pending states only.
- **Do** give every clickable element all three key-shadow states (rest/hover/press) — never ship a control with only a hover effect.
- **Do** set anything that names, labels, or measures (nav items, badges, emails, counts) in IBM Plex Mono, uppercase, letter-spaced.
- **Do** self-host every font via `@fontsource` — no Google Fonts or other font CDN.
- **Do** add `min-width: 0` to any flex/grid container holding user text (emails, labels) so it wraps instead of forcing page overflow.

### Don't:
- **Don't** use gradient text or a gradient fill anywhere in the system — the whole redesign exists to move away from the violet-to-cyan gradient look.
- **Don't** use purple/violet anywhere; it was the explicit thing being replaced.
- **Don't** render three same-size metric cards (icon + big number + label) side by side — use one continuous status-readout strip instead.
- **Don't** use a colored border-left/border-right stripe above 1px on any card, row, or callout.
- **Don't** let the amber status color leak onto a generic focus ring, a static badge, or a decorative icon — use `--focus` (#cfd3da) for focus and `--legend` for decoration.
