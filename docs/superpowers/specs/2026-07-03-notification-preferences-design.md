# Notification Preferences — User & Team Preference Management — Design

**Date:** 2026-07-03
**Status:** Approved

## Context

Today every notification fans out to everyone on every available channel. When a
calendar event is created/updated/deleted, `notifyEventChange` resolves the
audience via `getEventAudience`, writes an in-app `notification` row for **every**
recipient, and enqueues email delivery for **every** recipient plus a webhook post
to **every** connection of every team the actor belongs to. `notifyShareCreated`
does the same for `calendar_shared`. There is no preference layer — recipients and
team admins cannot opt out of anything.

The three delivery channels already have a natural ownership split:

- **In-app** (`notification` rows → `/app/notifications`) and **email** (Resend) are
  **per-user** — they land in an individual's inbox.
- **Webhooks** (Slack / Discord / Microsoft Teams via `integration_connection`) are
  **per-team** (org-owned).

This design adds a preference layer that respects that split:

- **User settings** control which categories reach *your* personal channels (in-app,
  email).
- **Team settings** control which categories post to *that team's* shared webhook
  channels, per connection.

There is no inheritance between the two — they are independent concerns.

## Goal

A user opens `/app/settings`, unchecks "Email" for out-of-office updates, and stops
getting emailed every time a teammate edits their calendar (while still seeing the
in-app notification). A team admin opens a team's Integrations card and mutes
out-of-office posts to the noisy `#general` Slack connection while leaving the HR
connection subscribed.

## Requirements

- A user can independently toggle **in-app** and **email** delivery for each of two
  categories:
  - **Out-of-office updates** — a teammate's OOO entry is created / updated /
    deleted (`event_created` / `event_updated` / `event_deleted`, grouped).
  - **Calendar shared with me** (`calendar_shared`).
- A team manager (owner/admin) can toggle **out-of-office updates** on/off **per
  webhook connection**.
- **Team invitations are transactional and always delivered** — not a preference.
  The invitation email is sent by the auth layer, frequently before the invitee has
  an account (so there are no preferences to read), and muting it would let someone
  be invited without ever finding out. `calendar_shared` and `team_invite` are never
  posted to team webhook channels — unchanged from today.
- **Defaults preserve current behavior:** an absent preference row or default column
  means *everything on*. No backfill; existing users and connections are unaffected
  until they change something.
- Preference reads must not meaningfully slow event creation. Per-channel filtering
  happens at the existing fan-out points.

## Data model

### New table `notification_preference`

One row per user, created lazily on first save. Boolean column per (category,
channel). A missing row is read as all-on.

- `userId` — text PK → `user.id` (`on delete cascade`).
- `oooInApp` — boolean, not null, default `true`.
- `oooEmail` — boolean, not null, default `true`.
- `sharedInApp` — boolean, not null, default `true`.
- `sharedEmail` — boolean, not null, default `true`.
- `updatedAt` — timestamptz, not null, default now, `$onUpdate`.

### New column on `integration_connection`

- `notifyOoo` — boolean, not null, default `true`. Whether out-of-office updates
  post to this connection.

The default column values mean every pre-existing connection keeps posting exactly
as it does today.

## Enforcement in the delivery pipeline

A new resolver in `src/lib/server/notifications.ts` (or a small
`notification-preferences.ts` beside it):

```ts
type ChannelPrefs = { oooInApp: boolean; oooEmail: boolean;
                      sharedInApp: boolean; sharedEmail: boolean };
getUserChannelPrefs(userIds: string[]): Promise<Map<string, ChannelPrefs>>;
```

It selects `notification_preference` rows for the given ids and returns a map;
**users with no row default to all-on**. The pure "given a prefs map + a recipient
list + a category + a channel, which recipients qualify" logic is factored into a
plain function so it can be unit-tested without a database, mirroring
`resolveEventAudience`.

Wiring at each fan-out point:

- **`notifyEventChange`** — after `getEventAudience`, fetch prefs for the audience,
  then split into two lists:
  - `inAppRecipients` = audience where `oooInApp` (default true) → insert in-app rows.
  - `emailRecipients` = audience where `oooEmail` → carried in the existing
    `EventDeliveryPayload.emailRecipients` into the queue.

  The two lists are computed separately, so a user can receive the in-app row but not
  the email (or vice versa).
- **`postEventToTeamChannels`** (worker side) — add `notify_ooo = true` to the
  connections `WHERE` clause so muted connections are simply not selected.
- **`notifyShareCreated`** — split the resolved target recipients by `sharedInApp` /
  `sharedEmail`. A pending-email target (no account yet) still emails by default —
  unchanged.

## User UI — `/app/settings`

A new **Notifications** `Card` below the Profile card. A compact grid: rows are the
two categories, columns are **In-app** and **Email**, cells are shadcn
`Switch` components. Saved as a single superform via a new `?/notifications` action,
mirroring the existing profile form (load hydrates from the user's row or all-on
defaults; save upserts the row).

Components: `Card`, `Switch`, `Label`, `Button`, `Field`. New zod
`notificationPreferencesSchema` in `src/lib/schemas/`.

## Team UI — `integrations-card.svelte`

Each connection `Item` gains a `Switch` labelled "Out-of-office updates" bound to
`notifyOoo`. Flipping it submits immediately via a new manager-only
`?/updateConnectionNotify` action — the same per-connection form pattern already used
by the test/remove buttons. The form carries the connection `id` and the new boolean;
the action re-checks `requireManager` and updates the row scoped to
`integrationConnection.orgId = params.id` (404 if it does not belong to this team).

## Backward compatibility

No data migration beyond the additive schema changes. Column defaults and the
"absent row = all-on" read semantics guarantee that, until a user or admin changes
something, delivery is byte-for-byte what it is today.

## Testing

Test-driven, following the existing `.spec.ts` conventions:

- The pure prefs-split function — unit tests over a prefs map for: all-on default
  (missing user), each channel toggled off independently, both off, and the two
  categories not bleeding into each other. Mirrors `resolveEventAudience` tests.
- `getUserChannelPrefs` — returns all-on for ids with no row; returns stored values
  otherwise.
- Server actions — `notifications` upsert (settings) and `updateConnectionNotify`
  (team, manager-only, org-scoped) where the action-test pattern exists.

## i18n

New paraglide messages for the settings card (title, description, category labels,
channel headers, save) and the connection switch label, across the existing locales:
en-GB, en-US, pl, fr.

## Out of scope

- Per-calendar-event-type filtering (vacation vs sick leave) — the category set is
  intentionally grouped.
- Team-default preferences that cascade to members — rejected in favor of the
  ownership split.
- Making `team_invite` opt-out-able — transactional, always delivered.
- Digest/batching or quiet-hours scheduling.
