# Async Notification Delivery via Job Queue — Design

**Date:** 2026-07-03
**Status:** Approved

## Context

Creating, updating, or moving a calendar event fans out notifications in-band:
`notifyEventChange` in `src/lib/server/notifications.ts` resolves the audience,
inserts in-app `notification` rows, sends emails through Resend, and POSTs to every
team webhook — and the calendar action `await`s all of it before redirecting. The
external calls dominate that latency: Resend API round-trips plus webhook POSTs that
each carry a 5-second timeout (`AbortSignal.timeout(5000)` in
`integrations/webhooks.ts`). A slow Slack/Discord/Teams endpoint directly stalls the
user's request.

Deletes are a second gap: the `delete` action sends **nothing** today — no in-app
row, no email, no webhook — and there is no `event_deleted` notification type.

## Goal

Move the slow, external part of event-change notification delivery off the request
path and onto a durable job queue, so calendar interactions return immediately. Bring
delete to full notification parity with create/update as part of the same work.

## Decisions

Settled during brainstorming:

- **Queue:** BullMQ + Redis. Chosen over a Postgres-backed queue (pg-boss) because the
  requirement is durable + retry + future scale, and Railway makes managed Redis a
  one-click add-on. Fire-and-forget (no queue) was rejected — it gives no durability.
- **Worker model:** in-process, split-ready. The BullMQ `Worker` runs inside the
  SvelteKit node server so `$env/dynamic/private` and `$lib/*` resolve with zero extra
  build config. Scaling = adding Railway instances (each runs web + worker; BullMQ
  distributes jobs). The queue code is standalone so a dedicated worker service stays a
  config-only split later.
- **In-band vs queued seam:** in-app `notification` row **inserts stay in-band**
  (local Postgres, sub-millisecond). Only **emails and webhook POSTs** — the external
  work — move to the worker.
- **Delivery semantics:** per-recipient delivery stays **best-effort**, exactly as
  today (individual email/webhook failures are swallowed and logged, never thrown).
  Per-recipient retry with idempotency keys is explicitly out of scope for v1.
- **Scope:** only event-change notifications (create/update/delete) are queued.
  `notifyShareCreated` (calendar-shared, team-invite) stays fully in-band.

## Architecture & data flow

```
calendar action (save / move / delete)
   ├─ DB write (insert/update/delete calendar_event)      [unchanged]
   ├─ notifyEventChange(actor, kind, title, type, range)  [in-band]
   │     ├─ resolve audience (getEventAudience)           local PG
   │     ├─ insert in-app notification rows               local PG
   │     └─ enqueueEventDelivery(job)                      ~1ms Redis, try/catch
   └─ redirect 303                                        ← user unblocked

BullMQ Worker (in-process, started once at boot)
   └─ processEventDelivery(job)
         ├─ deserialize (ISO → Date)
         └─ deliverEventChange(payload)                    [external work]
               ├─ send emails to job.emailRecipients       Resend
               └─ postEventToTeamChannels(actorId, …)       webhook POSTs
```

The job carries a snapshot of everything the worker needs, so it never re-reads the
event — required for delete, whose row is already gone. The resolved recipient list
travels in the job so the emailed audience exactly matches the in-app-notified
audience (no second audience query, no drift if a share changes in the gap).

Because in-app rows are written in-band and never retried, a job retry can only ever
re-send an email or re-post a webhook — it can never duplicate an in-app row.

## Modules

New `src/lib/server/queue/`:

- **`connection.ts`** — lazily constructs a single shared `ioredis` connection from
  `REDIS_URL` (BullMQ needs `maxRetriesPerRequest: null`). Returns `null` when
  `REDIS_URL` is unset so tests and the better-auth CLI can import the module without a
  broker.
- **`index.ts`** — `QUEUE_NAME`, the `EventDeliveryJob` type, a lazy `Queue`
  singleton, and `enqueueEventDelivery(payload)`. Enqueue accepts `Date`s and
  serializes the range to ISO. Job options: `attempts: 3`, exponential backoff,
  `removeOnComplete` (keep a small window), keep-last-N on fail.
- **`worker.ts`** — `startNotificationWorker()` creates the `Worker` (concurrency ~5)
  and wires the processor `processEventDelivery`, which parses ISO → `Date` and calls
  `deliverEventChange`.

`startNotificationWorker()` is invoked once at module load from `hooks.server.ts`,
guarded by: `!building` (`$app/environment`), `REDIS_URL` present, and a `globalThis`
singleton flag so dev HMR cannot spawn duplicate workers.

## Job contract

```ts
type EventDeliveryJob = {
	actorId: string;
	actorName: string;
	kind: 'created' | 'updated' | 'deleted';
	title: string | null;
	type: string;
	range: { allDay: boolean; start: string; end: string }; // ISO — Dates don't survive JSON
	emailRecipients: Array<{ email: string; locale: string }>;
};
```

The `Date ↔ ISO` conversion is confined to `enqueueEventDelivery` (write side) and
`processEventDelivery` (read side); callers keep working with `Date`s. Recipient
emails transit Redis briefly (internal, short-lived jobs, `removeOnComplete`) — an
accepted tradeoff for matching the in-app audience without a re-query.

## `notifications.ts` refactor

`notifyEventChange` splits into two units with a clear seam:

- **`notifyEventChange(actor, kind, eventTitle, eventType, range)`** — in-band, called
  by the calendar actions. Resolves audience, inserts in-app rows (with the
  kind-mapped type), and enqueues the delivery job with the resolved recipients. Same
  call shape the actions already use.
- **`deliverEventChange(payload)`** — the external delivery, called by the worker.
  Sends `eventChangeEmail` to each recipient in their locale via `Promise.allSettled`
  (failures logged), then `postEventToTeamChannels`. Runs in-process, so `env.ORIGIN`
  and the rest resolve normally.

`notifyRecipients` (used by `notifyShareCreated`) is left untouched — shares stay
fully in-band.

## Delete parity (new behavior)

Delete currently notifies nothing; bringing it to parity touches:

- **Schema:** add `'event_deleted'` to `notificationTypeEnum` in
  `src/lib/server/db/schema.ts`; `drizzle-kit generate` → `ALTER TYPE
notification_type ADD VALUE 'event_deleted'`, then `db:migrate`.
- **`notifyEventChange`:** widen `kind` to include `'deleted'` → maps to
  `event_deleted`.
- **Email** (`email.ts`): `eventChangeEmail` gains a `'deleted'` subject
  (`email_event_deleted_subject`); the body reuses `email_event_change_body` if its
  wording is kind-neutral, otherwise a `deleted` body variant is added.
- **Channels** (`integrations/message.ts`, `integrations/webhooks.ts`): widen
  `OooMessage.kind`, `ChannelEvent.kind`, `buildEventMessage`, and `composeLine` to
  `'deleted'`; add `channel_message_deleted`. The per-provider formatters are already
  kind-agnostic (they render `composeLine`), so `formatters.ts` needs no change.
- **Read-side** (`src/lib/notifications.ts`): extend the `AppNotification` union and
  `toAppNotification` to handle `event_deleted`; add the in-app label
  `notification_event_deleted`.
- **i18n:** add the new keys (`email_event_deleted_subject`, `channel_message_deleted`,
  `notification_event_deleted`, and any `deleted` email body) to all four locale files
  — `en-US`, `en-GB`, `fr`, `pl`.
- **Delete action** (`app/calendar/+page.server.ts`): extend the `.returning(...)`
  clause to include `type`, `title`, `allDay`, `start`, `end`, then call
  `notifyEventChange(..., 'deleted', ...)`.

## Calendar action changes

`app/calendar/+page.server.ts` — the `save` (create/update) and `move` actions
already call `notifyEventChange` in a `try/catch` that logs and continues; those call
sites are unchanged in shape (the function now inserts in-band and enqueues instead of
delivering in-band). The `delete` action gains the same guarded `notifyEventChange`
call plus the widened `.returning(...)`. If Redis is down, `enqueueEventDelivery`
throws, the `try/catch` logs it, and the calendar write (already committed) still
succeeds — same best-effort posture as today.

## Config & dev

- Dependencies: `bullmq`, `ioredis`.
- `REDIS_URL` added to `.env.example`; a `redis` service added to `compose.yaml` for
  local dev.
- Railway: add the Redis plugin (provides `REDIS_URL`); the in-process worker needs no
  separate service.

## Testing (TDD)

Unit-level, no live Redis (the queue is mocked):

- `enqueueEventDelivery` / `processEventDelivery` serialization round-trip
  (`Date → ISO → Date`).
- `processEventDelivery` calls `deliverEventChange` with parsed `Date`s.
- `deliverEventChange` best-effort behavior (a rejected email does not throw; channels
  still post).
- `notifyEventChange` `deleted` path: inserts `event_deleted` rows and enqueues a
  `deleted` job.
- `message.ts` / `email.ts` `deleted` rendering (`channel_message_deleted`,
  `email_event_deleted_subject`).
- Calendar `delete` action enqueues delivery.

Manual browser verification against dev Postgres + local Redis: create/update/delete
an event, confirm the redirect is immediate, the in-app row appears synchronously, and
the email/webhook arrive shortly after via the worker.

## Out of scope

- Per-recipient delivery retry and idempotency/dedupe (v1 stays best-effort).
- Queuing share/team-invite notifications (`notifyShareCreated` stays in-band).
- A dedicated standalone worker service (deferred; in-process worker is split-ready).
- Any dead-letter UI, queue dashboard, or delayed/scheduled notifications.
