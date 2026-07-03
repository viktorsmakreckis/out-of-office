# Integrations Phase 1 — Connection Foundation, Channel Notifications, iCal Feeds — Design

**Date:** 2026-07-03
**Status:** Approved

## Context: the integrations roadmap

The app will integrate with the tools teams already live in. The agreed roadmap
(breadth-first, each phase a separate spec → plan → implementation cycle):

- **Phase 1 (this spec):** integration-connection foundation, webhook channel
  notifications for Slack / Discord / Microsoft Teams, and read-only iCal feeds.
- **Phase 2 (future):** background scheduler; per-user OAuth presence sync — Slack
  status (`users.profile.set`), Outlook automatic replies + Teams status message via
  Microsoft Graph; scheduled channel digests ("who's off this week").
- **Phase 3 (future):** inbound commands — Slack slash commands, Discord
  interactions endpoint, Teams bot.

Target platforms are Slack, Microsoft (Teams + Outlook), and Discord. Google is out
of scope. Discord has no user-status API, so presence sync there is permanently out.

Tenancy: connections attach to a **team** (better-auth organization), not to a
tenant or the whole app. One team can hold connections to several providers at
once (its Slack workspace and its Discord server); different teams connect
different workspaces independently.

## Goal

A team admin pastes a webhook URL into the team's settings and the team's channel
starts receiving out-of-office posts ("🌴 **Viktors** is out **Mon Jul 6 – Wed
Jul 8** (Vacation)"). Anyone with a feed URL subscribes to a team's or a user's
out-of-office calendar from Outlook, Google Calendar, or Apple Calendar — no OAuth
anywhere in this phase.

## Requirements

- Teams can add any number of webhook connections across providers (`slack`,
  `discord`, `msteams`), each with an optional label; owner/admin only.
- Creating or updating a calendar event posts to every webhook connection of every
  team the actor is a member of. Only `event_created` / `event_updated` fan out to
  channels; `team_invite` and `calendar_shared` stay in-app/email.
- Delivery is best-effort and never blocks event creation. Failures are counted per
  connection and surfaced in the UI; no retry queue in this phase.
- A "send test message" action verifies a connection at setup time.
- Each user and each team has a secret-tokenized iCal feed URL; regenerating the
  token invalidates the old URL. A team feed contains all members' events; a user
  feed contains that user's events.
- Team page shows an Integrations section (connections + team feed URL); personal
  settings show the user's own feed URL.

## Data model

Two new Drizzle tables in `src/lib/server/db/schema.ts`:

**`integration_connection`**

- `id` (uuid pk), `orgId` / `userId` — XOR check constraint, same pattern as
  `calendar_share`. Phase 1 UI only creates org-scoped rows; the nullable `userId`
  column is there so Phase 2 user-OAuth connections need no reshaping.
- `provider` enum: `slack` | `discord` | `msteams`.
- `kind` enum: `webhook` (Phase 2 adds `oauth`).
- `webhookUrl` (text), `label` (nullable text), `createdById` (fk user),
  `createdAt`.
- Failure tracking: `consecutiveFailures` (int, default 0), `lastFailureAt`
  (nullable timestamp). Reset to 0 on success.

**`calendar_feed_token`**

- `token` (text pk, generated with `crypto.randomUUID()` — capability secret),
  `userId` / `orgId` XOR check, `createdAt`. Regenerate = delete + insert in one
  transaction. One token per owner: unique on the owner columns with
  `nullsNotDistinct`, as in `calendar_share_unique`.

## Channel notification flow

`notifyEventChange` in `src/lib/server/notifications.ts` gains a third fan-out
target alongside in-app rows and email:

1. Resolve the actor's team memberships (`member` table).
2. Load all webhook connections for those orgs.
3. Build one neutral message shape (actor name, event type label, title, date
   range, all-day flag), then format per provider:
   - **Slack:** Block Kit payload to an incoming webhook.
   - **Discord:** embed payload to a channel webhook.
   - **Teams:** Adaptive Card payload to a Power Automate Workflows webhook
     (classic Office 365 connectors are retired).
4. POST with `fetch`, `Promise.allSettled`, log failures — mirroring the existing
   email error handling. On failure increment `consecutiveFailures` and set
   `lastFailureAt`; on success reset.

Formatters live in a new `src/lib/server/integrations/` module: one file per
provider plus a shared `message.ts` defining the neutral shape. Each formatter is
a pure function payload-in → JSON-out, unit-testable without network.

Notification rule rationale: channels belong to teams, so team membership (not the
calendar-share audience) decides which channels hear about an event. A team admin
who pastes a webhook expects posts about their team's members.

## iCal feed

New public endpoint `GET /feeds/[token].ics` (outside the `app/` auth guard —
the token is the credential):

- Token lookup → user feed (that user's events) or org feed (events of all
  current members).
- All-day rows (stored UTC-midnight, end-inclusive by date) map to iCal `DATE`
  values with exclusive `DTEND` = end date + 1 day. Timed rows map to UTC
  `DATE-TIME` instants unchanged.
- `SUMMARY` = "«user name» — «event type label»" (+ title when present).
- Generation is a small hand-rolled module `src/lib/server/integrations/ical.ts`
  (VCALENDAR/VEVENT with proper line folding and escaping) — the format needed
  here is small enough not to warrant a dependency.
- Response headers: `Content-Type: text/calendar`, no caching.
- Unknown token → 404.

## UI

- **Team page** (`app/teams/[id]`, owner/admin only): "Integrations" card listing
  connections (provider icon, label, health — "failing since …" when
  `consecutiveFailures` > 0), add form (provider select + webhook URL + label),
  per-connection "send test message" and remove actions, and the team feed URL
  with copy + regenerate. Superforms actions, matching existing team-page style.
- **Personal settings** (`app/settings`): "Calendar feed" section with the user's
  feed URL, copy + regenerate. Feed tokens are created lazily on first visit.

## Error handling

- Webhook POST failures never throw into the event-creation path (fan-out is
  already fire-and-forget).
- Webhook URLs are validated on create: `https://` only, and host allow-listed per
  provider — `hooks.slack.com` (Slack), `discord.com` / `discordapp.com` (Discord),
  and `*.logic.azure.com` / `*.api.powerplatform.com` (Teams Workflows) — to keep
  the server from POSTing to arbitrary internal URLs (SSRF guard).
- Regenerating a feed token atomically swaps tokens; the old URL 404s immediately.

## Testing

- Vitest specs (existing `*.spec.ts` style): the three provider formatters, the
  iCal generator (all-day end-inclusive → DTEND+1, timed events, escaping/folding),
  webhook URL validation, and failure-counter update logic.
- Manual browser verification against dev Postgres: add a Discord/Slack webhook to
  a team, create an event, verify the post; subscribe to the feed URL and verify
  events render in a calendar client.

## Out of scope (later phases)

OAuth of any kind, presence/status sync, background scheduler, digests, retry
queues, inbound commands/bots, Discord nickname workarounds, two-way Microsoft
Graph calendar sync.
