# Out-of-Office Calendar — Design

**Date:** 2026-07-01
**Status:** Approved

## Purpose

An internal app where colleagues record their out-of-office time on a personal calendar and share that calendar with teams and individuals, so everyone can see who is away and when.

## Requirements

- **Auth:** email + password via better-auth, with signup email verification and password reset (emails via Resend). Entra ID SSO is planned later — the design must not block it.
- **Visibility:** a user's calendar is **private until shared**. Sharing targets are individual users or teams.
- **Entries:** all-day date ranges *and* timed partial-day absences. Each entry has a type (vacation, sick, travel, public holiday, other), an optional note, and a "show as busy only" privacy flag.
- **Teams:** any user can create a team and becomes its owner; owners manage members.
- **Views:** month grid, week view, team timeline, agenda list.
- **Notifications:** email when a calendar is shared with you, and when someone whose calendar you can see adds upcoming time off.
- **i18n:** en / pl / fr via Paraglide; all UI strings and emails localized.
- **Timezones:** every user has an IANA timezone; timed entries display in the viewer's zone.
- **UI:** shadcn-svelte components wherever possible; calendar views custom-built.

Out of scope: approval workflows, iCal export, in-app notification center, component/E2E tests.

## Architecture

Server-first SvelteKit, following the existing scaffold patterns:

- Load functions fetch data; form actions mutate, validated with superforms + zod (schemas shared client/server).
- No separate API layer. Calendar state (view, date) lives in query params — every calendar screen is linkable, SSR-rendered, back-button friendly. Example: `/calendar?view=month&date=2026-07-01`.
- Feedback via the existing sveltekit-flash-message + svelte-sonner setup.

### Routes

| Route | Purpose |
|---|---|
| `(auth)/login`, `signup`, `forgot-password`, `reset-password`, `verify-email` | Public auth pages; redirect to `/calendar` if signed in |
| `(app)/calendar` | Own calendar — month (default) / week / agenda, entry create/edit |
| `(app)/people` | List of calendars shared with you |
| `(app)/people/[userId]` | A colleague's calendar, read-only (404 if not shared with you) |
| `(app)/teams` | Your teams; create team |
| `(app)/teams/[teamId]` | Team timeline view + member management |
| `(app)/settings` | Profile (name, timezone, locale), password, manage outgoing shares |

The `(app)` layout guards authentication and loads the current user profile.

### Server modules

- `$lib/server/db/schema.ts` — domain tables (auth tables stay in generated `auth.schema.ts`)
- `$lib/server/shares.ts` — visibility resolution + share CRUD
- `$lib/server/ooo.ts` — entry CRUD + range queries
- `$lib/server/teams.ts` — team + membership CRUD
- `$lib/server/email/` — Resend client + localized templates (env: `RESEND_API_KEY`, `RESEND_EMAIL_ADDRESS`)

### UI modules

`$lib/components/calendar/` — MonthGrid, WeekView, Timeline, AgendaList, EntryDialog, EntryChip, CalendarHeader (view switcher + navigation + legend), drag-select behavior. Built on `@internationalized/date` and shadcn-svelte primitives.

## Data model

better-auth generated tables (`user`, `session`, `account`, `verification`) are unchanged; `account` already models OAuth providers, so adding Entra ID later is config-only (register a Microsoft provider), no migration.

`user` gains better-auth `additionalFields`:

- `timezone` — IANA string, auto-detected from browser at signup, editable in settings
- `locale` — `en | pl | fr`

Domain tables:

**`team`** — `id`, `name`, `description?`, `createdAt`

**`team_member`** — PK (`teamId`, `userId`), `role: 'owner' | 'member'`, `createdAt`.
Owners rename/delete the team and add/remove members; members can leave. A team always has ≥1 owner (last owner cannot leave/demote).

**`ooo_entry`** — `id`, `userId`, `allDay: boolean`,
all-day: `startDate`, `endDate` (Postgres `date`, inclusive, timezone-independent);
timed: `startAt`, `endAt` (`timestamptz`) + `timezone` (owner's zone at creation, for context display);
plus `type: 'vacation' | 'sick' | 'travel' | 'public_holiday' | 'other'`, `note?`, `busyOnly: boolean`, `createdAt`, `updatedAt`.
CHECK constraints: exactly the matching column pair is set per `allDay`, and start ≤ end.

**`calendar_share`** — `id`, `ownerId`, exactly one of `sharedWithUserId` / `sharedWithTeamId` (CHECK), `createdAt`, unique per (owner, target). Deleting a team cascades its shares.

### Visibility rule

One function in `shares.ts`: viewer B sees owner A's calendar iff **B = A**, or A has a share to B, or A has a share to a team B belongs to. Entries with `busyOnly` render for viewers other than the owner as "Busy" — dates/times only, no type or note.

Access is re-checked server-side in every load and action. A calendar the viewer cannot see returns **404** (not 403 — don't leak existence).

## Calendar UX

Shared header across views: view-switcher tabs, prev / today / next, type-color legend. Fixed color language everywhere: vacation blue, sick red, travel amber, public holiday green, other gray, busy-only striped gray.

- **Month grid** — localized week start; multi-day entries as chips spanning cells with "+N more" overflow popover. Drag across days → entry dialog pre-filled with the range; click a day → single-date entry; click a chip → edit/delete.
- **Week view** — 7 days × time axis; all-day lane on top; timed entries positioned in the viewer's timezone; drag vertically to create a timed entry.
- **Team timeline** — rows = members, columns = days; 2-week default window, navigable. Absence bars span days; today marker. Shows only what each member's visibility rules allow the viewer to see.
- **Agenda** — chronological upcoming entries grouped by month; the mobile-friendly view (grid views get horizontal scroll on small screens).
- **Entry dialog** — shadcn Dialog + superforms: all-day/timed toggle, date-range or datetime pickers, type select, note, busy-only switch. Real form action underneath (works without JS); drag-prefill is progressive enhancement.

## Timezones

- All-day entries are pure dates — never converted.
- Timed entries: stored as UTC instants, displayed in the **viewer's** timezone, owner's zone shown as secondary context in details ("09:00–13:00 your time · 15:00–19:00 in Warsaw").
- "Today" highlighting uses the viewer's timezone. SSR reads the viewer's timezone from their profile.

## i18n

All UI strings are Paraglide messages (en/pl/fr). Dates, weekday and month names via `Intl.DateTimeFormat` with the active locale; week start derived from locale. Emails localized to the recipient's stored locale.

## Email notifications (Resend)

- Auth: signup verification + password reset via better-auth hooks.
- "X shared their calendar with you" — on share creation; for team shares, sent to each current member.
- "X added time off" — on entry creation, to users who can see X's calendar, only when the entry starts within the next 60 days. Busy-only entries notify without type/note.
- Sends are fire-and-forget after the DB write: failures are logged server-side and never fail the user's action.

## Error handling

- zod validation on every form, client + server via superforms.
- Server-side access checks in every load/action (404 for invisible calendars, team pages for non-members).
- Mutations report via flash message → sonner toast.

## Testing

Vitest unit tests on pure logic: visibility resolution, date-range overlap and expansion math, month-grid generation, timezone display conversion, zod schemas. Component and E2E tests are out of scope.

## Future (explicitly deferred)

- Entra ID SSO: add better-auth Microsoft/generic-OAuth provider; `account` table already supports it.
- iCal feed export, approval workflows, in-app notifications.
