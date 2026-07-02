# Calendar Sharing — Design

**Date:** 2026-07-02
**Status:** Approved

## Goal

Let users share calendars: teams whose members automatically see one another's calendars,
optional shares of a personal or team calendar to any person or team, email + in-app
notifications with a share-back action, revocation from both sides, event-change
notifications, and calendar filtering.

## Requirements

- Users create teams; team members automatically see one another's calendars.
- A user can share their calendar with a person (any email, including unregistered) or a team,
  without being a member of that team.
- Team owners (and admins) can share the team's calendar with a person or a team.
- Every share dispatches an email and an in-app notification containing an action to share
  the recipient's calendar back to the sharer.
- Sharers can stop sharing at any time; recipients can stop seeing a shared calendar at any
  time (without affecting other recipients of the same share).
- Creating or modifying a calendar event (including drag & drop moves) dispatches email +
  in-app notifications to everyone who can see it. No digesting — one notification per change.
- Calendar filter: own entries / team entries / entries shared with them / all (default).
- Shared calendars are read-only with full event details (type, title, times). Only owners
  edit their events.
- Teams have full role management: owner / admin / member, ownership transfer, invitations
  by email with accept/decline, member removal, leave.

## Architecture decisions

- **Teams = better-auth organization plugin** (default owner/admin/member roles), added to
  the existing `better-auth/minimal` setup in `src/lib/server/auth.ts`. Schema regenerated
  into `auth.schema.ts` via `pnpm auth:schema` (adds `organization`, `member`, `invitation`
  tables). The plugin supplies invitations (works for unregistered emails — invitee signs up
  then accepts), role updates, and member removal. Ownership transfer = one action that
  promotes a member to owner and demotes the current owner to admin.
- **Sharing and notifications are custom Drizzle tables** + superforms actions, matching the
  existing calendar CRUD style.
- Rejected: fully custom team tables (reimplements invitation/role logic the plugin has);
  a generic "principal" abstraction (overkill for a two-type union).

## Data model

### `calendar_share`

One table covers user→user, user→team, team→user, team→team:

| column         | notes                                                                 |
| -------------- | --------------------------------------------------------------------- |
| `id`           | uuid pk                                                                |
| `sharerUserId` | XOR with `sharerOrgId` — whose calendar is shared                      |
| `sharerOrgId`  | a team's calendar = union of its members' events                       |
| `targetUserId` | XOR with `targetOrgId` XOR `targetEmail`                               |
| `targetOrgId`  |                                                                        |
| `targetEmail`  | pending share for an unregistered address                              |
| `createdById`  | who performed the share                                                |
| `createdAt`    |                                                                        |

Unique on (sharer, target). A better-auth `user.create` database hook converts pending
`targetEmail` shares to `targetUserId` when that email signs up.

### `calendar_share_hide`

`(userId, shareId)` — recipient-side opt-out. "Stop seeing" hides a share for that user only
(a share can target a whole team; one member opting out must not affect others). The sharer
side ("stop sharing") deletes the share row. Teammate visibility cannot be hidden — leave the
team instead.

### `notification`

| column      | notes                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `id`        | uuid pk                                                                   |
| `userId`    | recipient                                                                 |
| `type`      | enum: `team_invite`, `calendar_shared`, `event_created`, `event_updated`  |
| `actorName` | denormalized display name of who triggered it                             |
| `data`      | jsonb: `shareId` / `invitationId` / event summary                         |
| `readAt`    | nullable                                                                  |
| `createdAt` |                                                                           |

### Visibility rule

User U sees an event owned by O when any of:

1. U = O;
2. U and O share a team (org membership intersection);
3. a non-hidden `calendar_share` exists whose sharer covers O (O directly, or a team O
   belongs to) and whose target covers U (U directly, or a team U belongs to).

This logic lives in `src/lib/server/sharing.ts` as pure/query helpers shared by the calendar
load and the notification fan-out, and is unit-tested.

## Notifications & emails

- **Bell icon** in the app header with unread count from the layout server load (refreshes on
  navigation; no realtime infrastructure).
- **Share created** → in-app notification + email to each resolved recipient (team target →
  every member). Both carry the share-back action: the in-app notification renders a
  "Share your calendar back" button (form action creating the reciprocal share — recipient →
  original sharer — skipped if it already exists); the email CTA links to
  `/app/notifications`. If a *team* shared with you, share-back shares *your* calendar with
  that team. If a share targeted your team, a team owner/admin can share the team calendar
  back to the sharer.
- **Team invitations** use the plugin's `sendInvitationEmail` hook: email via the existing
  `email.ts` pattern (CTA → notifications page) plus a `team_invite` notification for
  registered invitees. The notifications page lists pending invitations with Accept/Decline
  calling `auth.api.acceptInvitation` / `rejectInvitation` server-side.
- **Event create/update/move** → after the DB write succeeds, compute the audience:
  teammates of the owner ∪ resolved recipients of shares covering the owner (direct or via
  the owner's teams), minus hides, minus the actor. Bulk-insert in-app notifications; send
  emails with `Promise.allSettled` — failures are logged and never block the save.

All new user-facing strings go through paraglide messages.

## Routes & UI

All under the authed `/app` layout. All forms: superforms + zod4, structured with the
`src/lib/components/ui/field` components; existing shadcn-svelte components only.

- **`/app/teams`** — list of your teams with role badges; create-team form.
- **`/app/teams/[id]`** — members with roles. Owner/admin: invite by email, remove member,
  change role. Owner: transfer ownership, rename, delete team. Member: leave. Team sharing
  card (owner/admin): share the team calendar with a person or team, list active/pending
  shares, revoke.
- **`/app/sharing`** — share your calendar with a person (email) or one of your teams;
  "Shared by you" list with revoke; "Shared with you" list with hide/unhide.
- **`/app/notifications`** — full list, newest first; Accept/Decline for invites,
  Share-back for shares; mark-all-read.
- **Calendar page** — load expands to the visibility union with a `filter` query param
  (`all` default | `mine` | `teams` | `shared`) driving the query and a toggle-group in the
  calendar header. Events gain an owner display name; other people's events show it in the
  chip and are read-only (calendar component gets a per-event `readonly` flag — not
  editable or draggable). Save/delete/move actions stay owner-scoped.

## Error handling

- Share actions validate the target exists where required (team id must be one of the
  actor's teams for user→team; sharer org actions require owner/admin role).
- Duplicate share attempts are idempotent (unique constraint; friendly message).
- Sharing with yourself is rejected by validation. Sharing your calendar with a team you
  belong to is allowed (redundant with teammate visibility, but harmless).
- Email failures never fail the triggering action (log + continue); missing RESEND config in
  dev logs to console per existing `sendEmail`.
- All mutating actions re-check authorization server-side (session user vs sharer/owner).

## Testing

- Vitest unit tests (existing `*.spec.ts` pattern): visibility/audience resolution given
  memberships + shares + hides; share/invite zod schemas; notification email builders.
- Svelte components run through the svelte-autofixer; end-to-end behavior verified in the
  browser preview against dev Postgres.
