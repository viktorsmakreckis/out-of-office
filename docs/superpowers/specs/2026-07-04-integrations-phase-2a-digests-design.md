# Integrations Phase 2a — Background Scheduler + Weekly Channel Digests — Design

**Date:** 2026-07-04
**Status:** Approved

## Context: decomposing Phase 2

The [Phase 1 design](2026-07-03-integrations-phase-1-design.md) sketches Phase 2 in
three lines: "background scheduler; per-user OAuth presence sync … scheduled channel
digests." Those are three separate subsystems, and the OAuth presence sync is large
(an OAuth connection model, encrypted token storage, two OAuth app registrations, and
three distinct presence APIs). The roadmap says each phase is its own spec → plan →
implementation cycle, so Phase 2 is split into three:

- **2a (this spec):** background scheduler + weekly "who's off this week" channel
  digests. No OAuth. Builds only on Phase 1 webhooks and the existing BullMQ queue.
- **2b (future):** per-user OAuth foundation (encrypted token storage/refresh, connect
  UI) + Slack presence sync (`users.profile.set`), using 2a's scheduler for boundary
  jobs.
- **2c (future):** Microsoft Graph presence — Outlook automatic replies + Teams status
  message — on top of 2b's OAuth foundation.

This spec covers **2a only**.

## Goal

A team admin turns on a weekly digest, picks a weekday, hour, and timezone, and the
team's chosen channels receive a "who's off this week" roster every week at that local
time — e.g. a Slack post listing "🌴 **Viktors** — Vacation (Jul 6 – Jul 8)" for every
member with time off in the current week. No OAuth anywhere in this phase.

## Requirements

- A team can enable a weekly digest with a per-team schedule: **weekday + hour +
  IANA timezone**. Owner/admin only.
- The digest covers the **current ISO week (Monday–Sunday) in the team's timezone** at
  send time — every member event overlapping that window.
- On a week where no member is off, behaviour is a per-team preference: **skip** (post
  nothing) or **post** a "nobody's off" message. Default: skip.
- The digest posts to the team's webhook connections where a new per-connection
  `notifyDigest` toggle is on (default on), decoupled from the existing `notifyOoo`
  toggle that governs per-event posts.
- Delivery is best-effort and reuses Phase 1's per-connection failure tracking. A
  digest send never blocks anything and never throws out of the worker.
- The scheduler is **per-team BullMQ repeatable jobs** (one job scheduler per enabled
  team), timezone-aware, with reconcile-on-boot and a self-heal path for orphans.
- Everything degrades to a silent no-op when Redis is not configured, exactly like the
  Phase 1 event-delivery queue.

## Data model

Two changes to `src/lib/server/db/schema.ts`.

### New table `team_digest_config`

One row per team, created lazily on first save; an absent row means the digest is
disabled (same "lazy row" pattern as `notification_preference`).

- `orgId` (text pk, FK `organization`, `onDelete: cascade`).
- `enabled` (boolean, not null, default `false`).
- `weekday` (integer, not null) — ISO weekday, `1` = Monday … `7` = Sunday.
- `hour` (integer, not null) — local hour `0`–`23`; the digest fires at minute `0`.
- `timezone` (text, not null) — IANA zone id (e.g. `Europe/Riga`), validated against
  `Intl.supportedValuesOf('timeZone')` on write.
- `postWhenEmpty` (boolean, not null, default `false`).
- `lastSentWeekKey` (text, nullable) — the ISO week key (`"2026-W28"`) of the most
  recent send, in the team's timezone; idempotency guard against retry double-posts.
- `updatedAt` (timestamptz, not null, `defaultNow`, `$onUpdate`).

`weekday`/`hour` bounds are enforced by the Zod schema on write; a DB `check` on both
columns (`weekday between 1 and 7`, `hour between 0 and 23`) is a cheap backstop.

### New column on `integration_connection`

- `notifyDigest` (boolean, not null, default `true`) — symmetric with the existing
  `notifyOoo`. Governs which of a team's webhook connections receive the weekly digest.
  Defaulting to `true` means enabling a team's digest "just works" for all its channels;
  a channel can be excluded by toggling this off. Decoupled from `notifyOoo` so muting
  per-event posts on a channel does not also mute its digest.

## Scheduler

A dedicated `digests` BullMQ queue (separate from the Phase 1 `notifications` queue so
digest jobs have their own retry/concurrency posture and job-scheduler namespace). New
module `src/lib/server/queue/digest-schedule.ts` owns the schedule lifecycle; it uses
BullMQ 5's Job Scheduler API (`upsertJobScheduler` / `getJobSchedulers` /
`removeJobScheduler`).

- **Scheduler id:** `digest:<orgId>` — stable per team, so upserts are idempotent.
- **Cron pattern:** built by a pure, tested helper from `weekday` + `hour`:
  `0 <hour> * * <cron-dow>`, where `cron-dow = weekday % 7` (ISO Sunday `7` → cron `0`).
  The scheduler is created with `{ pattern, tz: timezone }` so BullMQ does the
  timezone math and fires at the team's local wall-clock time.
- **`upsertDigestSchedule(config)`** — `queue.upsertJobScheduler('digest:<orgId>',
{ pattern, tz }, { name: 'weekly-digest', data: { orgId } })`. Called after any save
  that leaves the digest enabled.
- **`removeDigestSchedule(orgId)`** — `queue.removeJobScheduler('digest:<orgId>')`.
  Called when a digest is disabled.
- **`reconcileDigestSchedules()`** — compares live `getJobSchedulers()` against the set
  of enabled `team_digest_config` rows: upserts any missing, removes any orphaned. Run
  once on boot to recover from a Redis flush or configs saved while Redis was down.
- **Self-heal:** when a `weekly-digest` job runs and finds its config missing or
  disabled (e.g. the team was deleted, cascading the config away), it calls
  `removeDigestSchedule(orgId)` and returns without posting. This handles orphaned
  schedulers between boots.
- **No Redis:** every function is a no-op returning early (queue is `null`), matching
  the existing `getQueue()` posture. Config still persists to Postgres; schedules are
  reconciled whenever Redis is next available.

### Worker

`src/lib/server/queue/digest-worker.ts` exports `startDigestWorker()`: a BullMQ
`Worker` on the `digests` queue whose processor calls `sendTeamDigest(job.data.orgId)`.
Modelled on the existing `startNotificationWorker()` — `globalThis` guard against
duplicate workers across HMR, no-op without Redis, `SIGTERM`/`SIGINT` drain via
`worker.close()`, `failed`/`error` logging. `startDigestWorker()` also triggers
`reconcileDigestSchedules()` once after start.

Job options: `attempts: 1` (best-effort, like event delivery is fire-and-forget) —
because `sendTeamDigest` uses `Promise.allSettled` internally and never throws on a
connection failure, and stamping `lastSentWeekKey` after posting means an automatic
retry would risk re-posting to the channels that already succeeded. `removeOnComplete`
/ `removeOnFail` bounded as in the Phase 1 queue.

Boot wiring: `src/hooks.server.ts` calls `startDigestWorker()` alongside the existing
`startNotificationWorker()`, both gated on `!building`.

## Digest building & posting

New module `src/lib/server/integrations/digest.ts`. `sendTeamDigest(orgId)`:

1. Load the `team_digest_config` row. If missing or `enabled = false` → self-heal
   (`removeDigestSchedule(orgId)`) and return.
2. Compute the current ISO week window in the team's timezone from "now": a pure,
   tested `zonedWeekBounds(now, tz)` returning `{ weekStart, weekEndExclusive }` (UTC
   instants for Monday 00:00 local and the following Monday 00:00 local), plus a
   `weekLabel` (e.g. `"Jul 7 – Jul 13"`, formatted in the team locale) and a `weekKey`
   (ISO week-year + week, e.g. `"2026-W28"`). DST-correct and dependency-free via
   `Intl` — the same hand-rolled posture as `ical.ts`. Tested including a DST-transition
   week.
3. If `weekKey === lastSentWeekKey` → return without posting (retry guard).
4. Select member events overlapping the window. The org's member user ids come from
   `member`; a permissive SQL prefilter (`start < weekEndExclusive AND end >=
weekStart`) narrows candidates, and a pure, tested `overlapsWeek(event, weekStart,
weekEndExclusive)` makes the final decision. Overlap uses **end-exclusive
   normalization**: all-day rows (stored UTC-midnight, end-inclusive by date) are
   treated as `[start, end + 1 day)`; timed rows as `[start, end)` — the same DTEND+1
   rule already in `ical.ts`.
5. Build a provider-neutral `DigestMessage`:
   ```ts
   type DigestItem = { emoji: string; label: string; dateRange: string };
   type DigestEntry = { actorName: string; items: DigestItem[] };
   type DigestMessage = {
   	orgName: string;
   	weekLabel: string;
   	entries: DigestEntry[];
   	locale: Locale;
   };
   ```
   Rendered in the **team locale** (a channel has no single reader — consistent with
   Phase 1 event posts). Entries sorted by member name; items by event start. `emoji` /
   `label` / `dateRange` reuse `eventTypeEmoji`, `eventTypeLabelFor`, and
   `formatDateRange` from `message.ts`; a titled event shows its title in place of the
   type label, matching event posts. Event types are shown as-is (e.g. sick leave),
   consistent with how Phase 1 already reveals type to channels.
6. If `entries` is empty:
   - `postWhenEmpty = false` → stamp `lastSentWeekKey = weekKey` and return (no post).
   - `postWhenEmpty = true` → build a "nobody's off" `DigestMessage` (empty `entries`,
     rendered as a full-house line) and continue.
7. Post to the team's connections where `notifyDigest = true`, wrapped in
   `Promise.allSettled`; rejected results are logged, never thrown. Then stamp
   `lastSentWeekKey = weekKey`.

Posting reuses Phase 1's delivery core. `deliverToConnection` in `webhooks.ts` currently
couples three steps — build the event payload via `payloadFor`, `postJson`, then
`recordDeliveryResult` — so it cannot post a digest payload as written. A small,
targeted refactor extracts the payload-agnostic tail (`postJson` + `recordDeliveryResult`
into a `deliverPayloadToConnection(connection, payload)` helper); the existing event path
and the new digest path both call it, the first with `payloadFor(...)`, the second with
`digestPayloadFor(...)`. A digest post failure therefore increments the same
`consecutiveFailures` / `lastFailureAt` the Phase 1 UI already surfaces — a webhook that
is failing is failing regardless of message kind.

### Formatters

Extend `src/lib/server/integrations/formatters.ts` with
`digestPayloadFor(provider, message: DigestMessage)`, parallel to the existing
`payloadFor`:

- **Slack:** Block Kit — a header block (`orgName` + `weekLabel`) followed by a section
  whose text is the roster (one line per member, their items joined). Bold via `*…*`.
- **Discord:** an embed with a title (`orgName` — `weekLabel`) and the roster as the
  description (or one field per member). Bold via `**…**`.
- **Teams:** an Adaptive Card (Power Automate Workflows webhook) with a title `TextBlock`
  and a `TextBlock` per member.

Line composition reuses a shared helper so the per-provider files stay to bold-syntax +
envelope differences, mirroring `composeLine` in `message.ts`.

## UI

Team page Integrations card (`app/teams/[id]`, owner/admin only), in
`integrations-card.svelte`.

### Per-connection settings dialog

Per-connection controls are growing — Phase 1's `notifyOoo`, 2a's `notifyDigest`, the
test and remove actions, with room for more in later phases — and no longer fit inline on
the connection row. Each row collapses to a summary (provider name, label, and the
"failing since …" health badge) with a single **Settings** trigger that opens a
shadcn-svelte `Dialog` (`$lib/components/ui/dialog`). The dialog holds that connection's
controls: the `notifyOoo` and `notifyDigest` toggles, the "send test message" action, and
the remove action. The existing Superforms actions are unchanged — they simply render
inside the dialog. One dialog per row, keyed by connection id.

### Weekly digest subsection

A team-level **"Weekly digest"** subsection (team-wide, not per-connection) with an
**enable** switch that, when on, reveals: a **weekday** select (Mon–Sun), an **hour**
select (`00`–`23`), a **timezone** select (list from `Intl.supportedValuesOf(
'timeZone')`, defaulting to the acting user's `timezone`), and a **post-when-empty**
switch.

### Server

New Superforms actions in `app/teams/[id]/+page.server.ts`, all behind `requireManager`:

- `saveDigest` — validates the schedule (weekday/hour bounds, timezone in the supported
  set), upserts the `team_digest_config` row, then calls `upsertDigestSchedule` (enabled)
  or `removeDigestSchedule` (disabled).
- `updateConnectionDigest` — mirror of the existing `updateConnectionNotify`, setting
  `notifyDigest` on one org-scoped connection.

The page `load` gains the team's digest config (or defaults for the unsaved state) and a
`saveDigest` form, added to the existing `integrations` payload.

New paraglide messages for the dialog and subsection labels and the digest channel text
(header/roster-line/full-house templates), added to every locale catalog.

## Error handling

- The worker never throws: `sendTeamDigest` swallows per-connection failures via
  `Promise.allSettled` and logs them, matching Phase 1's webhook error handling.
- No Redis → scheduler and worker are silent no-ops; config still saves.
- Invalid timezone / out-of-range weekday or hour → rejected by the Zod schema before
  any DB write; the DB `check` constraints are a backstop.
- Team deletion cascades `team_digest_config` away; the leftover scheduler self-heals on
  its next fire, and `reconcileDigestSchedules()` removes it on the next boot.
- Retry/duplicate safety: `lastSentWeekKey` skips a second send for the same team-week;
  `attempts: 1` avoids automatic re-posting after a partial send.

## Testing

Vitest specs (existing `*.spec.ts` style), all pure/unit where possible:

- `zonedWeekBounds` — window/label/weekKey for a normal week and a DST-transition week,
  across a non-UTC zone.
- `overlapsWeek` — all-day end-inclusive events, timed events, and boundary events at
  both ends of the window; events entirely outside excluded.
- Digest neutral-shape builder — grouping/sorting, titled vs type-labelled items, the
  empty/full-house case.
- The three `digestPayloadFor` provider formatters — envelope shape, bold syntax,
  roster rendering.
- Cron-pattern builder — ISO weekday → cron dow (incl. Sunday `7` → `0`), hour placement.
- Scheduler-id helper.
- `lastSentWeekKey` idempotency — a second `sendTeamDigest` for the same week is a no-op.

Manual verification against dev Postgres + Redis: enable a digest for a team with a real
Slack/Discord webhook, set the send time a few minutes out in a known timezone, create a
member event in the current week, and confirm the scheduled post arrives; toggle
`notifyDigest` off on a connection and confirm it is skipped; disable the digest and
confirm the scheduler is removed.

## Out of scope (later phases)

OAuth of any kind and presence/status sync (2b/2c); per-user or DM digests; non-weekly
cadences (daily, fortnightly); a "send test digest now" action; digest history/audit UI;
and per-member opt-out of appearing in the roster (consistent with how Phase 1 channel
posts already work).
