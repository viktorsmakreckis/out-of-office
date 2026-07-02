# Calendar Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teams whose members see one another's calendars, optional calendar shares to any person/team with email + in-app notifications (including a share-back action), revocation from both sides, event-change notifications, and calendar filtering.

**Architecture:** Teams are better-auth's organization plugin (owner/admin/member roles, email invitations). Sharing/notifications are custom Drizzle tables (`calendar_share`, `calendar_share_hide`, `notification`) with pure, unit-tested visibility/audience resolution in `src/lib/server/sharing.ts`. All UI is superforms + zod4 form actions under `/app`, following the existing calendar/settings patterns.

**Tech Stack:** SvelteKit 2 / Svelte 5, Drizzle + Postgres, better-auth ~1.4 (`better-auth/minimal`), sveltekit-superforms + zod 4, paraglide i18n (en/pl/fr), Resend email, shadcn-svelte components, vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-calendar-sharing-design.md`

## Global Constraints

- Before writing code, invoke the `andrej-karpathy-skills:karpathy-guidelines` skill and follow it.
- Run every new/edited `.svelte` file through the `svelte-autofixer` MCP tool until it reports no issues.
- Commit messages: conventional commits, **never add a `Co-Authored-By` trailer** (user preference).
- Every user-facing string is a paraglide message defined in **all three** locales (`messages/en.json`, `messages/pl.json`, `messages/fr.json`). Message functions: `m.key()` or `m.key({param}, {locale})`.
- Forms: superforms + zod4 adapter, markup structured with `$lib/components/ui/field` (`Field.Group` / `Field.Field` / `Field.Label` / `Field.Error` — see `src/routes/app/settings/+page.svelte` for the canonical pattern). Use only existing `$lib/components/ui/*` components.
- Success feedback via flash messages: `redirect(303, path, { type: 'success', message }, event)` from `sveltekit-flash-message/server` (calendar page pattern) or `toast` on non-redirect pages.
- Server mutations always re-check authorization against `event.locals.user`.
- Email failures must never fail the triggering action: `Promise.allSettled` + `console.error`.
- DB commands: `pnpm db:generate` (create migration from schema), `pnpm db:migrate` (apply). Dev DB runs via `pnpm db:start` (docker compose, Postgres). `DATABASE_URL` comes from `.env`.
- Tests: `pnpm test` (vitest run). Type check: `pnpm check`. Lint: `pnpm lint`.
- better-auth server API calls take `{ body, headers: event.request.headers }` and throw `APIError` (from `better-auth`) on failure — catch and `fail(400, ...)` or flash an error.
- `src/lib/events/types.ts` must stay free of value imports that pull in `$lib` aliases (drizzle-kit bundles it via a relative import).

---

### Task 1: Organization plugin + regenerated auth schema + migration

**Files:**
- Modify: `src/lib/server/auth.ts`
- Regenerate: `src/lib/server/db/auth.schema.ts` (via `pnpm auth:schema`)
- Create: `drizzle/0004_teams.sql` (via `pnpm db:generate`)

**Interfaces:**
- Produces: `organization`, `member`, `invitation` Drizzle tables exported from `src/lib/server/db/auth.schema.ts` (re-exported by `schema.ts`). `member` has `{ id, organizationId, userId, role, createdAt }`; `invitation` has `{ id, organizationId, email, role, status, expiresAt, inviterId }`.
- Produces: `auth.api.createOrganization / createInvitation / acceptInvitation / rejectInvitation / removeMember / updateMemberRole / updateOrganization / deleteOrganization / leaveOrganization` server methods used by later tasks.
- The `sendInvitationEmail` hook body is a placeholder logging call in this task; Task 7 replaces it (email builders don't exist yet).

- [ ] **Step 1: Add the organization plugin to `src/lib/server/auth.ts`**

Add the import and plugin. The plugin must come **before** `sveltekitCookies` (which must stay last):

```ts
import { organization } from 'better-auth/plugins';
```

In the `plugins` array:

```ts
	plugins: [
		organization({
			sendInvitationEmail: async (data) => {
				// Replaced in a later task once invite emails + notifications exist.
				console.info(`[team-invite] to=${data.email} team=${data.organization.name}`);
			}
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
```

- [ ] **Step 2: Regenerate the auth schema**

Run: `pnpm auth:schema`
Expected: `src/lib/server/db/auth.schema.ts` gains `organization`, `member`, `invitation` tables (plus relations). Open the file and confirm the three tables exist and `user` is unchanged apart from possibly gaining relations.

- [ ] **Step 3: Generate and apply the migration**

Run: `pnpm db:generate` then `pnpm db:migrate`
Expected: a new file under `drizzle/` creating `organization`, `member`, `invitation`; migrate applies cleanly. (Postgres must be running: `pnpm db:start` in another terminal if it isn't.)

- [ ] **Step 4: Verify the app still boots and auth works**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/auth.ts src/lib/server/db/auth.schema.ts drizzle
git commit -m "feat(teams): add better-auth organization plugin and schema"
```

---

### Task 2: Sharing and notification tables

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create: next `drizzle/000N_*.sql` (via `pnpm db:generate`)

**Interfaces:**
- Produces: `calendarShare`, `calendarShareHide`, `notification` tables and `NotificationData` type, imported by later tasks from `$lib/server/db/schema`.
- `calendarShare`: exactly one of `sharerUserId`/`sharerOrgId` set; exactly one of `targetUserId`/`targetOrgId`/`targetEmail` set (DB CHECK constraints). Unique across the 5 columns with `NULLS NOT DISTINCT`.
- `notification.data` is typed jsonb `NotificationData = { shareId?: string; invitationId?: string; teamName?: string; eventTitle?: string | null; eventType?: string }`.

- [ ] **Step 1: Add the tables to `src/lib/server/db/schema.ts`**

Extend the existing imports and append after `calendarEvent`:

```ts
import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';
// Relative import: drizzle-kit bundles this file without $lib alias resolution.
import { eventTypes } from '../../events/types';
import { organization, user } from './auth.schema';
```

```ts
/**
 * A calendar share: exactly one sharer column (user or org) and exactly one
 * target column (user, org, or a pending email that converts to a user on
 * signup). See docs/superpowers/specs/2026-07-02-calendar-sharing-design.md.
 */
export const calendarShare = pgTable(
	'calendar_share',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sharerUserId: text('sharer_user_id').references(() => user.id, { onDelete: 'cascade' }),
		sharerOrgId: text('sharer_org_id').references(() => organization.id, { onDelete: 'cascade' }),
		targetUserId: text('target_user_id').references(() => user.id, { onDelete: 'cascade' }),
		targetOrgId: text('target_org_id').references(() => organization.id, { onDelete: 'cascade' }),
		targetEmail: text('target_email'),
		createdById: text('created_by_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'calendar_share_sharer_xor',
			sql`num_nonnulls(${table.sharerUserId}, ${table.sharerOrgId}) = 1`
		),
		check(
			'calendar_share_target_xor',
			sql`num_nonnulls(${table.targetUserId}, ${table.targetOrgId}, ${table.targetEmail}) = 1`
		),
		unique('calendar_share_unique')
			.on(
				table.sharerUserId,
				table.sharerOrgId,
				table.targetUserId,
				table.targetOrgId,
				table.targetEmail
			)
			.nullsNotDistinct(),
		index('calendar_share_target_user_idx').on(table.targetUserId),
		index('calendar_share_target_org_idx').on(table.targetOrgId),
		index('calendar_share_sharer_user_idx').on(table.sharerUserId),
		index('calendar_share_sharer_org_idx').on(table.sharerOrgId),
		index('calendar_share_target_email_idx').on(table.targetEmail)
	]
);

/** Recipient-side opt-out: hides one share for one user without affecting others. */
export const calendarShareHide = pgTable(
	'calendar_share_hide',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		shareId: text('share_id')
			.notNull()
			.references(() => calendarShare.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.userId, table.shareId] })]
);

export const notificationTypeEnum = pgEnum('notification_type', [
	'team_invite',
	'calendar_shared',
	'event_created',
	'event_updated'
]);

export type NotificationData = {
	shareId?: string;
	invitationId?: string;
	teamName?: string;
	eventTitle?: string | null;
	eventType?: string;
};

export const notification = pgTable(
	'notification',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: notificationTypeEnum('type').notNull(),
		actorName: text('actor_name').notNull(),
		data: jsonb('data').$type<NotificationData>().notNull().default({}),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('notification_user_id_idx').on(table.userId, table.createdAt)]
);
```

- [ ] **Step 2: Generate and apply the migration**

Run: `pnpm db:generate` then `pnpm db:migrate`
Expected: migration creates the three tables + enum; applies cleanly. If `nullsNotDistinct()` fails on the installed Postgres (<15), replace the unique constraint with a raw SQL unique index using `coalesce(col, '')` in a custom migration — but check the docker compose Postgres version first (it should be ≥15).

- [ ] **Step 3: Type check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle
git commit -m "feat(sharing): calendar_share, calendar_share_hide, notification tables"
```

---

### Task 3: i18n messages for the whole feature

**Files:**
- Modify: `messages/en.json`, `messages/pl.json`, `messages/fr.json`

**Interfaces:**
- Produces: every `m.*` key used by Tasks 4–15. Later tasks reference these exact key names.

- [ ] **Step 1: Append to `messages/en.json`** (inside the top-level object; keep JSON valid)

```json
{
	"nav_teams": "Teams",
	"nav_sharing": "Sharing",
	"nav_notifications": "Notifications",
	"error_forbidden": "You do not have permission to do that.",

	"teams_title": "Teams",
	"teams_empty": "You are not a member of any team yet.",
	"teams_create_title": "Create a team",
	"teams_create_description": "Team members automatically see one another's calendars.",
	"team_name_label": "Name",
	"teams_create_cta": "Create team",
	"team_created": "Team created",
	"team_role_owner": "Owner",
	"team_role_admin": "Admin",
	"team_role_member": "Member",

	"team_members_title": "Members",
	"team_invite_title": "Invite a member",
	"team_invite_role_label": "Role",
	"team_invite_cta": "Send invitation",
	"team_invite_sent": "Invitation sent",
	"team_pending_invites_title": "Pending invitations",
	"team_member_remove": "Remove",
	"team_member_removed": "Member removed",
	"team_role_updated": "Role updated",
	"team_transfer_cta": "Make owner",
	"team_transfer_confirm_title": "Transfer ownership?",
	"team_transfer_confirm_description": "{name} will become the owner and you will become an admin.",
	"team_transferred": "Ownership transferred",
	"team_settings_title": "Team settings",
	"team_rename_cta": "Rename",
	"team_renamed": "Team renamed",
	"team_delete_cta": "Delete team",
	"team_delete_confirm_title": "Delete this team?",
	"team_delete_confirm_description": "This removes the team, its memberships, its invitations, and its calendar shares.",
	"team_deleted": "Team deleted",
	"team_leave_cta": "Leave team",
	"team_leave_confirm_title": "Leave this team?",
	"team_leave_confirm_description": "You will stop seeing your teammates' calendars.",
	"team_left": "You left the team",
	"team_share_title": "Team calendar",
	"team_share_description": "Share the calendars of all team members with a person or another team.",

	"sharing_title": "Sharing",
	"share_form_title": "Share your calendar",
	"share_form_description": "The recipient will be able to see your events.",
	"share_target_label": "Share with",
	"share_target_person": "Person",
	"share_target_team": "Team",
	"share_email_label": "Email",
	"share_team_label": "Team",
	"share_cta": "Share",
	"share_created": "Calendar shared",
	"share_pending": "Pending signup",
	"share_by_you_title": "Shared by you",
	"share_with_you_title": "Shared with you",
	"share_empty": "Nothing here yet.",
	"share_revoke": "Stop sharing",
	"share_revoked": "Sharing stopped",
	"share_hide": "Hide",
	"share_unhide": "Show",
	"share_hidden": "Calendar hidden",
	"share_unhidden": "Calendar shown",
	"share_duplicate": "This calendar is already shared with that recipient.",
	"share_self": "You cannot share a calendar with yourself.",
	"share_back_cta": "Share your calendar back",
	"share_back_done": "Calendar shared back",
	"share_from_team": "Team {name}",

	"notifications_title": "Notifications",
	"notifications_empty": "No notifications yet.",
	"notifications_mark_all_read": "Mark all as read",
	"notifications_bell_label": "Notifications",
	"notification_calendar_shared": "{name} shared a calendar with you",
	"notification_event_created": "{name} created an event",
	"notification_event_updated": "{name} updated an event",
	"notification_team_invite": "{name} invited you to team {team}",
	"invitation_accept": "Accept",
	"invitation_decline": "Decline",
	"invitation_accepted": "Invitation accepted",
	"invitation_declined": "Invitation declined",
	"invitation_gone": "This invitation is no longer valid.",

	"calendar_filter_label": "Show",
	"calendar_filter_all": "All",
	"calendar_filter_mine": "Mine",
	"calendar_filter_teams": "Teams",
	"calendar_filter_shared": "Shared",

	"email_team_invite_subject": "{name} invited you to team {team}",
	"email_team_invite_body": "Accept the invitation to see your teammates' calendars in Out of Office.",
	"email_team_invite_cta": "View invitation",
	"email_calendar_shared_subject": "{name} shared a calendar with you",
	"email_calendar_shared_body": "You can now see their events in Out of Office. From your notifications you can share your calendar back.",
	"email_calendar_shared_cta": "Share yours back",
	"email_event_created_subject": "{name} created an event",
	"email_event_updated_subject": "{name} updated an event",
	"email_event_change_body": "{name} changed \"{title}\" on a calendar you can see.",
	"email_event_change_cta": "Open calendar",

	"validation_team_name_required": "Team name is required",
	"validation_team_name_too_long": "Team name is too long",
	"validation_email_invalid": "Enter a valid email address",
	"validation_share_team_required": "Choose a team"
}
```

- [ ] **Step 2: Append the same keys to `messages/pl.json`**

```json
{
	"nav_teams": "Zespoły",
	"nav_sharing": "Udostępnianie",
	"nav_notifications": "Powiadomienia",
	"error_forbidden": "Nie masz uprawnień do tej operacji.",

	"teams_title": "Zespoły",
	"teams_empty": "Nie należysz jeszcze do żadnego zespołu.",
	"teams_create_title": "Utwórz zespół",
	"teams_create_description": "Członkowie zespołu automatycznie widzą swoje kalendarze.",
	"team_name_label": "Nazwa",
	"teams_create_cta": "Utwórz zespół",
	"team_created": "Zespół utworzony",
	"team_role_owner": "Właściciel",
	"team_role_admin": "Administrator",
	"team_role_member": "Członek",

	"team_members_title": "Członkowie",
	"team_invite_title": "Zaproś osobę",
	"team_invite_role_label": "Rola",
	"team_invite_cta": "Wyślij zaproszenie",
	"team_invite_sent": "Zaproszenie wysłane",
	"team_pending_invites_title": "Oczekujące zaproszenia",
	"team_member_remove": "Usuń",
	"team_member_removed": "Członek usunięty",
	"team_role_updated": "Rola zaktualizowana",
	"team_transfer_cta": "Uczyń właścicielem",
	"team_transfer_confirm_title": "Przekazać własność?",
	"team_transfer_confirm_description": "{name} zostanie właścicielem, a Ty administratorem.",
	"team_transferred": "Własność przekazana",
	"team_settings_title": "Ustawienia zespołu",
	"team_rename_cta": "Zmień nazwę",
	"team_renamed": "Nazwa zmieniona",
	"team_delete_cta": "Usuń zespół",
	"team_delete_confirm_title": "Usunąć ten zespół?",
	"team_delete_confirm_description": "Usunie to zespół, członkostwa, zaproszenia i udostępnienia kalendarza.",
	"team_deleted": "Zespół usunięty",
	"team_leave_cta": "Opuść zespół",
	"team_leave_confirm_title": "Opuścić ten zespół?",
	"team_leave_confirm_description": "Przestaniesz widzieć kalendarze członków zespołu.",
	"team_left": "Zespół opuszczony",
	"team_share_title": "Kalendarz zespołu",
	"team_share_description": "Udostępnij kalendarze wszystkich członków zespołu osobie lub innemu zespołowi.",

	"sharing_title": "Udostępnianie",
	"share_form_title": "Udostępnij swój kalendarz",
	"share_form_description": "Odbiorca będzie widzieć Twoje wydarzenia.",
	"share_target_label": "Udostępnij",
	"share_target_person": "Osobie",
	"share_target_team": "Zespołowi",
	"share_email_label": "E-mail",
	"share_team_label": "Zespół",
	"share_cta": "Udostępnij",
	"share_created": "Kalendarz udostępniony",
	"share_pending": "Oczekuje na rejestrację",
	"share_by_you_title": "Udostępnione przez Ciebie",
	"share_with_you_title": "Udostępnione Tobie",
	"share_empty": "Nic tu jeszcze nie ma.",
	"share_revoke": "Przestań udostępniać",
	"share_revoked": "Udostępnianie zakończone",
	"share_hide": "Ukryj",
	"share_unhide": "Pokaż",
	"share_hidden": "Kalendarz ukryty",
	"share_unhidden": "Kalendarz widoczny",
	"share_duplicate": "Ten kalendarz jest już udostępniony temu odbiorcy.",
	"share_self": "Nie możesz udostępnić kalendarza samemu sobie.",
	"share_back_cta": "Udostępnij swój kalendarz w zamian",
	"share_back_done": "Kalendarz udostępniony w zamian",
	"share_from_team": "Zespół {name}",

	"notifications_title": "Powiadomienia",
	"notifications_empty": "Brak powiadomień.",
	"notifications_mark_all_read": "Oznacz wszystkie jako przeczytane",
	"notifications_bell_label": "Powiadomienia",
	"notification_calendar_shared": "{name} udostępnia Ci kalendarz",
	"notification_event_created": "{name} tworzy wydarzenie",
	"notification_event_updated": "{name} aktualizuje wydarzenie",
	"notification_team_invite": "{name} zaprasza Cię do zespołu {team}",
	"invitation_accept": "Akceptuj",
	"invitation_decline": "Odrzuć",
	"invitation_accepted": "Zaproszenie zaakceptowane",
	"invitation_declined": "Zaproszenie odrzucone",
	"invitation_gone": "To zaproszenie jest już nieaktualne.",

	"calendar_filter_label": "Pokaż",
	"calendar_filter_all": "Wszystkie",
	"calendar_filter_mine": "Moje",
	"calendar_filter_teams": "Zespoły",
	"calendar_filter_shared": "Udostępnione",

	"email_team_invite_subject": "{name} zaprasza Cię do zespołu {team}",
	"email_team_invite_body": "Zaakceptuj zaproszenie, aby widzieć kalendarze członków zespołu w Out of Office.",
	"email_team_invite_cta": "Zobacz zaproszenie",
	"email_calendar_shared_subject": "{name} udostępnia Ci kalendarz",
	"email_calendar_shared_body": "Możesz teraz widzieć te wydarzenia w Out of Office. W powiadomieniach możesz udostępnić swój kalendarz w zamian.",
	"email_calendar_shared_cta": "Udostępnij swój",
	"email_event_created_subject": "{name} tworzy wydarzenie",
	"email_event_updated_subject": "{name} aktualizuje wydarzenie",
	"email_event_change_body": "{name} zmienia \"{title}\" w kalendarzu, który widzisz.",
	"email_event_change_cta": "Otwórz kalendarz",

	"validation_team_name_required": "Nazwa zespołu jest wymagana",
	"validation_team_name_too_long": "Nazwa zespołu jest za długa",
	"validation_email_invalid": "Podaj prawidłowy adres e-mail",
	"validation_share_team_required": "Wybierz zespół"
}
```

- [ ] **Step 3: Append the same keys to `messages/fr.json`**

```json
{
	"nav_teams": "Équipes",
	"nav_sharing": "Partage",
	"nav_notifications": "Notifications",
	"error_forbidden": "Vous n'avez pas la permission de faire cela.",

	"teams_title": "Équipes",
	"teams_empty": "Vous n'êtes encore membre d'aucune équipe.",
	"teams_create_title": "Créer une équipe",
	"teams_create_description": "Les membres d'une équipe voient automatiquement leurs calendriers respectifs.",
	"team_name_label": "Nom",
	"teams_create_cta": "Créer l'équipe",
	"team_created": "Équipe créée",
	"team_role_owner": "Propriétaire",
	"team_role_admin": "Admin",
	"team_role_member": "Membre",

	"team_members_title": "Membres",
	"team_invite_title": "Inviter un membre",
	"team_invite_role_label": "Rôle",
	"team_invite_cta": "Envoyer l'invitation",
	"team_invite_sent": "Invitation envoyée",
	"team_pending_invites_title": "Invitations en attente",
	"team_member_remove": "Retirer",
	"team_member_removed": "Membre retiré",
	"team_role_updated": "Rôle mis à jour",
	"team_transfer_cta": "Nommer propriétaire",
	"team_transfer_confirm_title": "Transférer la propriété ?",
	"team_transfer_confirm_description": "{name} deviendra propriétaire et vous deviendrez admin.",
	"team_transferred": "Propriété transférée",
	"team_settings_title": "Paramètres de l'équipe",
	"team_rename_cta": "Renommer",
	"team_renamed": "Équipe renommée",
	"team_delete_cta": "Supprimer l'équipe",
	"team_delete_confirm_title": "Supprimer cette équipe ?",
	"team_delete_confirm_description": "Cela supprime l'équipe, ses membres, ses invitations et ses partages de calendrier.",
	"team_deleted": "Équipe supprimée",
	"team_leave_cta": "Quitter l'équipe",
	"team_leave_confirm_title": "Quitter cette équipe ?",
	"team_leave_confirm_description": "Vous ne verrez plus les calendriers de vos coéquipiers.",
	"team_left": "Vous avez quitté l'équipe",
	"team_share_title": "Calendrier d'équipe",
	"team_share_description": "Partagez les calendriers de tous les membres avec une personne ou une autre équipe.",

	"sharing_title": "Partage",
	"share_form_title": "Partager votre calendrier",
	"share_form_description": "Le destinataire pourra voir vos événements.",
	"share_target_label": "Partager avec",
	"share_target_person": "Une personne",
	"share_target_team": "Une équipe",
	"share_email_label": "E-mail",
	"share_team_label": "Équipe",
	"share_cta": "Partager",
	"share_created": "Calendrier partagé",
	"share_pending": "En attente d'inscription",
	"share_by_you_title": "Partagé par vous",
	"share_with_you_title": "Partagé avec vous",
	"share_empty": "Rien ici pour l'instant.",
	"share_revoke": "Arrêter le partage",
	"share_revoked": "Partage arrêté",
	"share_hide": "Masquer",
	"share_unhide": "Afficher",
	"share_hidden": "Calendrier masqué",
	"share_unhidden": "Calendrier affiché",
	"share_duplicate": "Ce calendrier est déjà partagé avec ce destinataire.",
	"share_self": "Vous ne pouvez pas partager un calendrier avec vous-même.",
	"share_back_cta": "Partager votre calendrier en retour",
	"share_back_done": "Calendrier partagé en retour",
	"share_from_team": "Équipe {name}",

	"notifications_title": "Notifications",
	"notifications_empty": "Aucune notification.",
	"notifications_mark_all_read": "Tout marquer comme lu",
	"notifications_bell_label": "Notifications",
	"notification_calendar_shared": "{name} a partagé un calendrier avec vous",
	"notification_event_created": "{name} a créé un événement",
	"notification_event_updated": "{name} a mis à jour un événement",
	"notification_team_invite": "{name} vous a invité dans l'équipe {team}",
	"invitation_accept": "Accepter",
	"invitation_decline": "Refuser",
	"invitation_accepted": "Invitation acceptée",
	"invitation_declined": "Invitation refusée",
	"invitation_gone": "Cette invitation n'est plus valide.",

	"calendar_filter_label": "Afficher",
	"calendar_filter_all": "Tout",
	"calendar_filter_mine": "Les miens",
	"calendar_filter_teams": "Équipes",
	"calendar_filter_shared": "Partagés",

	"email_team_invite_subject": "{name} vous a invité dans l'équipe {team}",
	"email_team_invite_body": "Acceptez l'invitation pour voir les calendriers de vos coéquipiers dans Out of Office.",
	"email_team_invite_cta": "Voir l'invitation",
	"email_calendar_shared_subject": "{name} a partagé un calendrier avec vous",
	"email_calendar_shared_body": "Vous pouvez maintenant voir ces événements dans Out of Office. Depuis vos notifications, vous pouvez partager votre calendrier en retour.",
	"email_calendar_shared_cta": "Partager le vôtre",
	"email_event_created_subject": "{name} a créé un événement",
	"email_event_updated_subject": "{name} a mis à jour un événement",
	"email_event_change_body": "{name} a modifié « {title} » sur un calendrier que vous voyez.",
	"email_event_change_cta": "Ouvrir le calendrier",

	"validation_team_name_required": "Le nom de l'équipe est requis",
	"validation_team_name_too_long": "Le nom de l'équipe est trop long",
	"validation_email_invalid": "Saisissez une adresse e-mail valide",
	"validation_share_team_required": "Choisissez une équipe"
}
```

- [ ] **Step 4: Verify compilation**

Run: `pnpm check`
Expected: 0 errors (paraglide regenerates message functions during `svelte-kit sync`).

- [ ] **Step 5: Commit**

```bash
git add messages
git commit -m "feat(sharing): i18n messages for teams, sharing, notifications"
```

---

### Task 4: Email builders

**Files:**
- Modify: `src/lib/server/email.ts`
- Test: `src/lib/server/email.spec.ts` (append to existing suite)

**Interfaces:**
- Consumes: existing `actionEmail`, `EmailContent`, `Locale` in `email.ts`.
- Produces:
  - `teamInviteEmail(inviterName: string, teamName: string, url: string, locale: Locale): EmailContent`
  - `calendarSharedEmail(sharerName: string, url: string, locale: Locale): EmailContent`
  - `eventChangeEmail(actorName: string, eventLabel: string, kind: 'created' | 'updated', url: string, locale: Locale): EmailContent`

- [ ] **Step 1: Write failing tests** (append to `src/lib/server/email.spec.ts`, follow the existing test style in that file — read it first)

```ts
describe('sharing emails', () => {
	it('teamInviteEmail includes inviter, team and url', () => {
		const content = teamInviteEmail('Alice', 'Design', 'https://x/app/notifications', 'en');
		expect(content.subject).toContain('Alice');
		expect(content.subject).toContain('Design');
		expect(content.text).toContain('https://x/app/notifications');
	});

	it('calendarSharedEmail includes sharer and url', () => {
		const content = calendarSharedEmail('Alice', 'https://x/app/notifications', 'en');
		expect(content.subject).toContain('Alice');
		expect(content.text).toContain('https://x/app/notifications');
	});

	it('eventChangeEmail localizes subject per kind', () => {
		const created = eventChangeEmail('Alice', 'Vacation', 'created', 'https://x/app/calendar', 'en');
		const updated = eventChangeEmail('Alice', 'Vacation', 'updated', 'https://x/app/calendar', 'en');
		expect(created.subject).toContain('created');
		expect(updated.subject).toContain('updated');
		expect(created.text).toContain('Vacation');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/server/email.spec.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Implement the builders** (append to `src/lib/server/email.ts`, mirroring the existing builders)

```ts
export function teamInviteEmail(
	inviterName: string,
	teamName: string,
	url: string,
	locale: Locale
): EmailContent {
	const o = { locale };
	return actionEmail(
		m.email_team_invite_subject({ name: inviterName, team: teamName }, o),
		m.email_team_invite_body({}, o),
		m.email_team_invite_cta({}, o),
		url
	);
}

export function calendarSharedEmail(sharerName: string, url: string, locale: Locale): EmailContent {
	const o = { locale };
	return actionEmail(
		m.email_calendar_shared_subject({ name: sharerName }, o),
		m.email_calendar_shared_body({}, o),
		m.email_calendar_shared_cta({}, o),
		url
	);
}

export function eventChangeEmail(
	actorName: string,
	eventLabel: string,
	kind: 'created' | 'updated',
	url: string,
	locale: Locale
): EmailContent {
	const o = { locale };
	const subject =
		kind === 'created'
			? m.email_event_created_subject({ name: actorName }, o)
			: m.email_event_updated_subject({ name: actorName }, o);
	return actionEmail(
		subject,
		m.email_event_change_body({ name: actorName, title: eventLabel }, o),
		m.email_event_change_cta({}, o),
		url
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/server/email.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/email.ts src/lib/server/email.spec.ts
git commit -m "feat(sharing): invite, share, and event-change email builders"
```

---

### Task 5: Sharing logic — pure resolution + DB helpers

**Files:**
- Create: `src/lib/server/sharing.ts`
- Test: `src/lib/server/sharing.spec.ts`

**Interfaces:**
- Consumes: `calendarShare`, `calendarShareHide`, `member`, `organization`, `user` tables; `db`.
- Produces (used by Tasks 7, 13–15):

```ts
export type MembershipRow = { organizationId: string; userId: string };
export type ShareRow = {
	id: string;
	sharerUserId: string | null;
	sharerOrgId: string | null;
	targetUserId: string | null;
	targetOrgId: string | null;
};
export type ShareEntity =
	| { type: 'user'; id: string }
	| { type: 'org'; id: string }
	| { type: 'email'; email: string };

export function resolveVisibleOwners(
	viewerId: string,
	memberships: MembershipRow[],
	shares: ShareRow[]
): Map<string, 'team' | 'share'>;

export function resolveEventAudience(
	ownerId: string,
	memberships: MembershipRow[],
	shares: ShareRow[],
	hides: { userId: string; shareId: string }[]
): Set<string>;

export type VisibleOwner = { id: string; name: string; via: 'team' | 'share' };
export async function getVisibleOwners(viewerId: string): Promise<VisibleOwner[]>;

export type Recipient = { id: string; email: string; name: string; locale: string };
export async function getEventAudience(ownerId: string): Promise<Recipient[]>;
export async function getUsersByIds(ids: string[]): Promise<Recipient[]>;

export async function createShare(
	sharer: ShareEntity,
	target: ShareEntity,
	createdById: string
): Promise<{ id: string } | 'duplicate'>;
```

- [ ] **Step 1: Write failing tests for the pure functions** (`src/lib/server/sharing.spec.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { resolveEventAudience, resolveVisibleOwners } from './sharing';

const org = (organizationId: string, ...userIds: string[]) =>
	userIds.map((userId) => ({ organizationId, userId }));

describe('resolveVisibleOwners', () => {
	it('sees teammates via shared org membership', () => {
		const owners = resolveVisibleOwners('me', org('t1', 'me', 'bob', 'eve'), []);
		expect(owners.get('bob')).toBe('team');
		expect(owners.get('eve')).toBe('team');
		expect(owners.has('me')).toBe(false);
	});

	it('sees a user who shared directly with viewer', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'ann', sharerOrgId: null, targetUserId: 'me', targetOrgId: null }
		];
		expect(resolveVisibleOwners('me', [], shares).get('ann')).toBe('share');
	});

	it('sees all members of a team that shared its calendar with viewer', () => {
		const shares = [
			{ id: 's1', sharerUserId: null, sharerOrgId: 't2', targetUserId: 'me', targetOrgId: null }
		];
		const owners = resolveVisibleOwners('me', org('t2', 'ann', 'bob'), shares);
		expect(owners.get('ann')).toBe('share');
		expect(owners.get('bob')).toBe('share');
	});

	it('sees a user who shared with a team the viewer belongs to', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'ann', sharerOrgId: null, targetUserId: null, targetOrgId: 't1' }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me'), shares).get('ann')).toBe('share');
	});

	it('ignores shares targeting other people or other teams', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'ann', sharerOrgId: null, targetUserId: 'bob', targetOrgId: null },
			{ id: 's2', sharerUserId: 'eve', sharerOrgId: null, targetUserId: null, targetOrgId: 't9' }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me'), shares).size).toBe(0);
	});

	it('team visibility wins over share visibility', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'bob', sharerOrgId: null, targetUserId: 'me', targetOrgId: null }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me', 'bob'), shares).get('bob')).toBe('team');
	});

	it('never includes the viewer, even via an org share', () => {
		const shares = [
			{ id: 's1', sharerUserId: null, sharerOrgId: 't1', targetUserId: 'me', targetOrgId: null }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me', 'bob'), shares).has('me')).toBe(false);
	});
});

describe('resolveEventAudience', () => {
	it('includes teammates of the owner', () => {
		const audience = resolveEventAudience('me', org('t1', 'me', 'bob'), [], []);
		expect(audience.has('bob')).toBe(true);
		expect(audience.has('me')).toBe(false);
	});

	it('includes direct share recipients', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'me', sharerOrgId: null, targetUserId: 'ann', targetOrgId: null }
		];
		expect(resolveEventAudience('me', [], shares, []).has('ann')).toBe(true);
	});

	it('includes members of a target team, minus those who hid the share', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'me', sharerOrgId: null, targetUserId: null, targetOrgId: 't2' }
		];
		const audience = resolveEventAudience('me', org('t2', 'ann', 'bob'), shares, [
			{ userId: 'bob', shareId: 's1' }
		]);
		expect(audience.has('ann')).toBe(true);
		expect(audience.has('bob')).toBe(false);
	});

	it('includes recipients of a share made by a team the owner belongs to', () => {
		const shares = [
			{ id: 's1', sharerUserId: null, sharerOrgId: 't1', targetUserId: 'ann', targetOrgId: null }
		];
		expect(resolveEventAudience('me', org('t1', 'me'), shares, []).has('ann')).toBe(true);
	});

	it('a hide only silences the hidden share, not another route', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'me', sharerOrgId: null, targetUserId: 'ann', targetOrgId: null },
			{ id: 's2', sharerUserId: null, sharerOrgId: 't1', targetUserId: 'ann', targetOrgId: null }
		];
		const audience = resolveEventAudience('me', org('t1', 'me'), shares, [
			{ userId: 'ann', shareId: 's1' }
		]);
		expect(audience.has('ann')).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/server/sharing.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/server/sharing.ts`**

```ts
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarShare, calendarShareHide, member, user } from '$lib/server/db/schema';

export type MembershipRow = { organizationId: string; userId: string };
export type ShareRow = {
	id: string;
	sharerUserId: string | null;
	sharerOrgId: string | null;
	targetUserId: string | null;
	targetOrgId: string | null;
};
export type ShareEntity =
	| { type: 'user'; id: string }
	| { type: 'org'; id: string }
	| { type: 'email'; email: string };

function membersByOrg(memberships: MembershipRow[]): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const row of memberships) {
		const list = map.get(row.organizationId);
		if (list) list.push(row.userId);
		else map.set(row.organizationId, [row.userId]);
	}
	return map;
}

function orgIdsOf(userId: string, memberships: MembershipRow[]): Set<string> {
	return new Set(memberships.filter((m) => m.userId === userId).map((m) => m.organizationId));
}

/**
 * Owners whose calendars the viewer can see, excluding the viewer.
 * 'team' (shared org membership) wins over 'share' when both apply.
 * `shares` must already exclude shares the viewer has hidden.
 */
export function resolveVisibleOwners(
	viewerId: string,
	memberships: MembershipRow[],
	shares: ShareRow[]
): Map<string, 'team' | 'share'> {
	const byOrg = membersByOrg(memberships);
	const viewerOrgs = orgIdsOf(viewerId, memberships);
	const result = new Map<string, 'team' | 'share'>();
	for (const orgId of viewerOrgs) {
		for (const userId of byOrg.get(orgId) ?? []) {
			if (userId !== viewerId) result.set(userId, 'team');
		}
	}
	for (const share of shares) {
		const targetsViewer =
			share.targetUserId === viewerId ||
			(share.targetOrgId !== null && viewerOrgs.has(share.targetOrgId));
		if (!targetsViewer) continue;
		const owners = share.sharerUserId
			? [share.sharerUserId]
			: (byOrg.get(share.sharerOrgId ?? '') ?? []);
		for (const userId of owners) {
			if (userId !== viewerId && !result.has(userId)) result.set(userId, 'share');
		}
	}
	return result;
}

/** Users to notify about a change to the owner's calendar, excluding the owner. */
export function resolveEventAudience(
	ownerId: string,
	memberships: MembershipRow[],
	shares: ShareRow[],
	hides: { userId: string; shareId: string }[]
): Set<string> {
	const byOrg = membersByOrg(memberships);
	const ownerOrgs = orgIdsOf(ownerId, memberships);
	const hiddenBy = new Map<string, Set<string>>();
	for (const hide of hides) {
		const set = hiddenBy.get(hide.shareId);
		if (set) set.add(hide.userId);
		else hiddenBy.set(hide.shareId, new Set([hide.userId]));
	}
	const audience = new Set<string>();
	for (const orgId of ownerOrgs) {
		for (const userId of byOrg.get(orgId) ?? []) audience.add(userId);
	}
	for (const share of shares) {
		const coversOwner =
			share.sharerUserId === ownerId ||
			(share.sharerOrgId !== null && ownerOrgs.has(share.sharerOrgId));
		if (!coversOwner) continue;
		const recipients = share.targetUserId
			? [share.targetUserId]
			: (byOrg.get(share.targetOrgId ?? '') ?? []);
		const hidden = hiddenBy.get(share.id);
		for (const userId of recipients) {
			if (!hidden?.has(userId)) audience.add(userId);
		}
	}
	audience.delete(ownerId);
	return audience;
}

const shareColumns = {
	id: calendarShare.id,
	sharerUserId: calendarShare.sharerUserId,
	sharerOrgId: calendarShare.sharerOrgId,
	targetUserId: calendarShare.targetUserId,
	targetOrgId: calendarShare.targetOrgId
};

async function membershipsOfOrgs(orgIds: string[]): Promise<MembershipRow[]> {
	if (orgIds.length === 0) return [];
	return db
		.select({ organizationId: member.organizationId, userId: member.userId })
		.from(member)
		.where(inArray(member.organizationId, orgIds));
}

async function orgIdsOfUser(userId: string): Promise<string[]> {
	const rows = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId));
	return rows.map((row) => row.organizationId);
}

export type VisibleOwner = { id: string; name: string; via: 'team' | 'share' };

/** All owners (id + display name) whose calendars the viewer can see. */
export async function getVisibleOwners(viewerId: string): Promise<VisibleOwner[]> {
	const viewerOrgIds = await orgIdsOfUser(viewerId);
	const targetFilters = [eq(calendarShare.targetUserId, viewerId)];
	if (viewerOrgIds.length > 0) targetFilters.push(inArray(calendarShare.targetOrgId, viewerOrgIds));
	const shareRows = await db
		.select({ ...shareColumns, hiddenBy: calendarShareHide.userId })
		.from(calendarShare)
		.leftJoin(
			calendarShareHide,
			and(eq(calendarShareHide.shareId, calendarShare.id), eq(calendarShareHide.userId, viewerId))
		)
		.where(or(...targetFilters));
	const shares = shareRows.filter((row) => row.hiddenBy === null);
	const sharerOrgIds = shares.flatMap((s) => (s.sharerOrgId ? [s.sharerOrgId] : []));
	const memberships = await membershipsOfOrgs([...new Set([...viewerOrgIds, ...sharerOrgIds])]);
	const owners = resolveVisibleOwners(viewerId, memberships, shares);
	if (owners.size === 0) return [];
	const users = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, [...owners.keys()]));
	return users.map((u) => ({ ...u, via: owners.get(u.id)! }));
}

export type Recipient = { id: string; email: string; name: string; locale: string };

export async function getUsersByIds(ids: string[]): Promise<Recipient[]> {
	if (ids.length === 0) return [];
	return db
		.select({ id: user.id, email: user.email, name: user.name, locale: user.locale })
		.from(user)
		.where(inArray(user.id, ids));
}

/** Everyone to notify about a change to the owner's calendar (owner excluded). */
export async function getEventAudience(ownerId: string): Promise<Recipient[]> {
	const ownerOrgIds = await orgIdsOfUser(ownerId);
	const sharerFilters = [eq(calendarShare.sharerUserId, ownerId)];
	if (ownerOrgIds.length > 0) sharerFilters.push(inArray(calendarShare.sharerOrgId, ownerOrgIds));
	const shares = await db.select(shareColumns).from(calendarShare).where(or(...sharerFilters));
	const targetOrgIds = shares.flatMap((s) => (s.targetOrgId ? [s.targetOrgId] : []));
	const memberships = await membershipsOfOrgs([...new Set([...ownerOrgIds, ...targetOrgIds])]);
	const hides =
		shares.length === 0
			? []
			: await db
					.select({ userId: calendarShareHide.userId, shareId: calendarShareHide.shareId })
					.from(calendarShareHide)
					.where(
						inArray(
							calendarShareHide.shareId,
							shares.map((s) => s.id)
						)
					);
	const audience = resolveEventAudience(ownerId, memberships, shares, hides);
	return getUsersByIds([...audience]);
}

function entityColumns(prefix: 'sharer' | 'target', entity: ShareEntity) {
	return {
		[`${prefix}UserId`]: entity.type === 'user' ? entity.id : null,
		[`${prefix}OrgId`]: entity.type === 'org' ? entity.id : null,
		...(prefix === 'target' ? { targetEmail: entity.type === 'email' ? entity.email : null } : {})
	};
}

/** Inserts a share; returns 'duplicate' when the (sharer, target) pair already exists. */
export async function createShare(
	sharer: ShareEntity,
	target: ShareEntity,
	createdById: string
): Promise<{ id: string } | 'duplicate'> {
	const inserted = await db
		.insert(calendarShare)
		.values({
			...entityColumns('sharer', sharer),
			...entityColumns('target', target),
			createdById
		})
		.onConflictDoNothing()
		.returning({ id: calendarShare.id });
	return inserted[0] ?? 'duplicate';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/server/sharing.spec.ts`
Expected: PASS (all cases). Then `pnpm check` — 0 errors. If the spread-typing of `entityColumns` fights TypeScript, replace it with explicit ternaries in the `values({...})` call — clarity over cleverness.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/sharing.ts src/lib/server/sharing.spec.ts
git commit -m "feat(sharing): visibility and audience resolution with share helpers"
```

---

### Task 6: Notifications module

**Files:**
- Create: `src/lib/server/notifications.ts`

**Interfaces:**
- Consumes: `notification` table, `NotificationData`; `sendEmail`, `calendarSharedEmail`, `eventChangeEmail`, `userLocale` from email.ts; `getEventAudience`, `getUsersByIds`, `Recipient`, `ShareEntity` from sharing.ts; `member`, `organization`, `user` tables.
- Produces (used by Tasks 8, 13–15):

```ts
export async function notifyShareCreated(
	shareId: string,
	sharerName: string,
	target: ShareEntity
): Promise<void>;

export async function notifyEventChange(
	actor: { id: string; name: string },
	kind: 'created' | 'updated',
	eventTitle: string | null,
	eventType: string
): Promise<void>;
```

- [ ] **Step 1: Implement `src/lib/server/notifications.ts`**

This is orchestration over the DB and email modules (no pure logic worth unit testing on its own — the resolution logic is covered by Task 5's tests; end-to-end behavior is verified in the browser in Task 15).

```ts
import { eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { m } from '$lib/paraglide/messages.js';
import { isLocale, baseLocale } from '$lib/paraglide/runtime';
import { db } from '$lib/server/db';
import { member, notification, user, type NotificationData } from '$lib/server/db/schema';
import {
	calendarSharedEmail,
	eventChangeEmail,
	sendEmail,
	type EmailContent
} from '$lib/server/email';
import { getEventAudience, getUsersByIds, type Recipient, type ShareEntity } from './sharing';

type NotificationType = 'team_invite' | 'calendar_shared' | 'event_created' | 'event_updated';

/** Inserts in-app rows and sends emails; email failures are logged, never thrown. */
async function notifyRecipients(
	recipients: Recipient[],
	type: NotificationType,
	actorName: string,
	data: NotificationData,
	emailFor: (recipient: Recipient) => EmailContent
): Promise<void> {
	if (recipients.length === 0) return;
	await db.insert(notification).values(
		recipients.map((recipient) => ({ userId: recipient.id, type, actorName, data }))
	);
	const results = await Promise.allSettled(
		recipients.map((recipient) => sendEmail(recipient.email, emailFor(recipient)))
	);
	for (const result of results) {
		if (result.status === 'rejected') console.error('[notifications] email failed:', result.reason);
	}
}

function recipientLocale(recipient: Recipient) {
	return isLocale(recipient.locale) ? recipient.locale : baseLocale;
}

async function resolveTargetRecipients(target: ShareEntity): Promise<Recipient[]> {
	if (target.type === 'user') return getUsersByIds([target.id]);
	if (target.type === 'org') {
		const rows = await db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, target.id));
		return getUsersByIds(rows.map((row) => row.userId));
	}
	return []; // pending email target: no user rows yet
}

const notificationsUrl = () => `${env.ORIGIN}/app/notifications`;

/**
 * Notifies the share target (in-app + email). For a pending email target the
 * email goes straight to the address; the in-app row is created at signup by
 * the user.create hook in auth.ts.
 */
export async function notifyShareCreated(
	shareId: string,
	sharerName: string,
	target: ShareEntity
): Promise<void> {
	if (target.type === 'email') {
		try {
			await sendEmail(target.email, calendarSharedEmail(sharerName, notificationsUrl(), baseLocale));
		} catch (error) {
			console.error('[notifications] email failed:', error);
		}
		return;
	}
	const recipients = await resolveTargetRecipients(target);
	await notifyRecipients(recipients, 'calendar_shared', sharerName, { shareId }, (recipient) =>
		calendarSharedEmail(sharerName, notificationsUrl(), recipientLocale(recipient))
	);
}

function eventTypeLabelFor(type: string, locale: ReturnType<typeof recipientLocale>): string {
	const labels: Record<string, (p: object, o: { locale: typeof locale }) => string> = {
		vacation: m.calendar_event_type_vacation,
		sick_leave: m.calendar_event_type_sick_leave,
		business_trip: m.calendar_event_type_business_trip,
		public_holiday: m.calendar_event_type_public_holiday,
		remote_work: m.calendar_event_type_remote_work,
		other: m.calendar_event_type_other
	};
	return (labels[type] ?? m.calendar_event_type_other)({}, { locale });
}

/** Notifies everyone who can see the actor's calendar about a created/updated event. */
export async function notifyEventChange(
	actor: { id: string; name: string },
	kind: 'created' | 'updated',
	eventTitle: string | null,
	eventType: string
): Promise<void> {
	const recipients = await getEventAudience(actor.id);
	const type = kind === 'created' ? 'event_created' : 'event_updated';
	await notifyRecipients(
		recipients,
		type,
		actor.name,
		{ eventTitle, eventType },
		(recipient) => {
			const locale = recipientLocale(recipient);
			const label = eventTitle ?? eventTypeLabelFor(eventType, locale);
			return eventChangeEmail(actor.name, label, kind, `${env.ORIGIN}/app/calendar`, locale);
		}
	);
}

/** Display name of a share's sharer entity ("Alice" or the team name). */
export async function sharerDisplayName(share: {
	sharerUserId: string | null;
	sharerOrgId: string | null;
}): Promise<string> {
	if (share.sharerUserId) {
		const rows = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, share.sharerUserId));
		return rows[0]?.name ?? '';
	}
	const { organization } = await import('$lib/server/db/schema');
	const rows = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, share.sharerOrgId ?? ''));
	return rows[0]?.name ?? '';
}
```

Note: import `organization` statically at the top with the other schema imports instead of the dynamic import shown above — write it as a normal top-level import; the dynamic form is only shown to make the dependency explicit. Also import `inArray` only if used; drop unused imports before committing.

- [ ] **Step 2: Type check**

Run: `pnpm check`
Expected: 0 errors. Fix the `eventTypeLabelFor` record typing if paraglide's generated signatures disagree — an acceptable fallback is `switch` on the type string mirroring `src/lib/events/labels.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/notifications.ts
git commit -m "feat(sharing): notification fan-out module"
```

---

### Task 7: Auth hooks — invitation email + pending-share conversion

**Files:**
- Modify: `src/lib/server/auth.ts`

**Interfaces:**
- Consumes: `teamInviteEmail`, `sendEmail`, `userLocale` (email.ts); `notification`, `calendarShare`, `user` tables; `sharerDisplayName` (notifications.ts).
- Produces: working team-invite emails + in-app `team_invite` notifications; pending email shares convert to user shares on signup with a `calendar_shared` notification.

- [ ] **Step 1: Replace the placeholder `sendInvitationEmail` in `src/lib/server/auth.ts`**

Add imports:

```ts
import { and, eq } from 'drizzle-orm';
import { calendarShare, notification, user } from '$lib/server/db/schema';
import { sharerDisplayName } from '$lib/server/notifications';
import { teamInviteEmail } from '$lib/server/email';
```

Replace the plugin config:

```ts
organization({
	sendInvitationEmail: async (data) => {
		const invitee = await db.select().from(user).where(eq(user.email, data.email)).limit(1);
		const locale = invitee[0] ? userLocale(invitee[0]) : baseLocale;
		await sendEmail(
			data.email,
			teamInviteEmail(
				data.inviter.user.name,
				data.organization.name,
				`${env.ORIGIN}/app/notifications`,
				locale
			)
		);
		if (invitee[0]) {
			await db.insert(notification).values({
				userId: invitee[0].id,
				type: 'team_invite',
				actorName: data.inviter.user.name,
				data: { invitationId: data.id, teamName: data.organization.name }
			});
		}
	}
})
```

- [ ] **Step 2: Add the `databaseHooks` block to the `betterAuth({...})` options** (top level, alongside `plugins`)

```ts
databaseHooks: {
	user: {
		create: {
			after: async (newUser) => {
				const pending = await db
					.select()
					.from(calendarShare)
					.where(eq(calendarShare.targetEmail, newUser.email));
				for (const share of pending) {
					try {
						await db
							.update(calendarShare)
							.set({ targetUserId: newUser.id, targetEmail: null })
							.where(eq(calendarShare.id, share.id));
					} catch {
						// The sharer already has an explicit share to this user: drop the pending row.
						await db.delete(calendarShare).where(eq(calendarShare.id, share.id));
						continue;
					}
					await db.insert(notification).values({
						userId: newUser.id,
						type: 'calendar_shared',
						actorName: await sharerDisplayName(share),
						data: { shareId: share.id }
					});
				}
			}
		}
	}
},
```

- [ ] **Step 3: Type check**

Run: `pnpm check`
Expected: 0 errors. (If `data.inviter.user.name` isn't typed on the invitation payload in this better-auth version, log the actual payload shape once in dev and adjust — the invitation data includes the inviter member with its user relation.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/auth.ts
git commit -m "feat(teams): invitation emails, invite notifications, pending-share conversion"
```

---

### Task 8: Form schemas

**Files:**
- Create: `src/lib/schemas/team.ts`, `src/lib/schemas/share.ts`
- Test: `src/lib/schemas/team.spec.ts`, `src/lib/schemas/share.spec.ts`

**Interfaces:**
- Produces (consumed by Tasks 10–15):

```ts
// team.ts
export const createTeamSchema; // { name: string }  (trim, 1..100)
export const renameTeamSchema; // same shape as createTeamSchema
export const inviteMemberSchema; // { email: string; role: 'member' | 'admin' }
export const memberIdSchema; // { memberId: string }
export const updateRoleSchema; // { memberId: string; role: 'member' | 'admin' }
export const invitationActionSchema; // { invitationId: string }

// share.ts
export const shareTargetSchema; // { targetType: 'person' | 'team'; email: string; teamId: string }
export const shareIdSchema; // { id: string }
export const shareBackSchema; // { notificationId: string }
```

- [ ] **Step 1: Write failing tests**

`src/lib/schemas/team.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTeamSchema, inviteMemberSchema } from './team';

describe('createTeamSchema', () => {
	it('accepts a normal name and trims it', () => {
		expect(createTeamSchema.parse({ name: '  Design  ' }).name).toBe('Design');
	});
	it('rejects empty and overlong names', () => {
		expect(createTeamSchema.safeParse({ name: '   ' }).success).toBe(false);
		expect(createTeamSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
	});
});

describe('inviteMemberSchema', () => {
	it('accepts valid email + role', () => {
		expect(inviteMemberSchema.safeParse({ email: 'a@b.co', role: 'member' }).success).toBe(true);
	});
	it('rejects bad email and owner role', () => {
		expect(inviteMemberSchema.safeParse({ email: 'nope', role: 'member' }).success).toBe(false);
		expect(inviteMemberSchema.safeParse({ email: 'a@b.co', role: 'owner' }).success).toBe(false);
	});
});
```

`src/lib/schemas/share.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shareTargetSchema } from './share';

describe('shareTargetSchema', () => {
	it('requires a valid email for person targets', () => {
		expect(
			shareTargetSchema.safeParse({ targetType: 'person', email: 'a@b.co', teamId: '' }).success
		).toBe(true);
		expect(
			shareTargetSchema.safeParse({ targetType: 'person', email: 'nope', teamId: '' }).success
		).toBe(false);
	});
	it('requires a teamId for team targets and ignores email', () => {
		expect(
			shareTargetSchema.safeParse({ targetType: 'team', email: '', teamId: 't1' }).success
		).toBe(true);
		expect(
			shareTargetSchema.safeParse({ targetType: 'team', email: '', teamId: '' }).success
		).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/schemas`
Expected: FAIL — modules don't exist (existing auth/event schema tests still pass).

- [ ] **Step 3: Implement `src/lib/schemas/team.ts`**

```ts
import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const createTeamSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_team_name_required() })
		.max(100, { error: () => m.validation_team_name_too_long() })
});

export const renameTeamSchema = createTeamSchema;

export const inviteMemberSchema = z.object({
	email: z.email({ error: () => m.validation_email_invalid() }),
	role: z.enum(['member', 'admin'], { error: () => m.error_generic() })
});

export const memberIdSchema = z.object({
	memberId: z.string().min(1, { error: () => m.error_generic() })
});

export const updateRoleSchema = z.object({
	memberId: z.string().min(1, { error: () => m.error_generic() }),
	role: z.enum(['member', 'admin'], { error: () => m.error_generic() })
});

export const invitationActionSchema = z.object({
	invitationId: z.string().min(1, { error: () => m.error_generic() })
});
```

- [ ] **Step 4: Implement `src/lib/schemas/share.ts`**

```ts
import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const shareTargetSchema = z
	.object({
		targetType: z.enum(['person', 'team'], { error: () => m.error_generic() }),
		email: z.string().trim().default(''),
		teamId: z.string().default('')
	})
	.check((ctx) => {
		const { targetType, email, teamId } = ctx.value;
		if (targetType === 'person' && !z.email().safeParse(email).success) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_email_invalid(),
				path: ['email'],
				input: email
			});
		}
		if (targetType === 'team' && teamId === '') {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_share_team_required(),
				path: ['teamId'],
				input: teamId
			});
		}
	});

export const shareIdSchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() })
});

export const shareBackSchema = z.object({
	notificationId: z.string().min(1, { error: () => m.error_generic() })
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/lib/schemas`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/team.ts src/lib/schemas/share.ts src/lib/schemas/team.spec.ts src/lib/schemas/share.spec.ts
git commit -m "feat(sharing): team and share form schemas"
```

---

### Task 9: App layout — nav links + notification bell

**Files:**
- Modify: `src/routes/app/+layout.server.ts`
- Modify: `src/routes/app/+layout.svelte`

**Interfaces:**
- Consumes: `notification` table.
- Produces: layout data gains `unreadCount: number`; header gains Teams/Sharing nav links and a bell linking to `/app/notifications`.

- [ ] **Step 1: Extend `src/routes/app/+layout.server.ts`**

```ts
import { redirect } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const [{ unreadCount }] = await db
		.select({ unreadCount: count() })
		.from(notification)
		.where(and(eq(notification.userId, locals.user.id), isNull(notification.readAt)));
	return { user: locals.user, unreadCount };
};
```

- [ ] **Step 2: Add nav links + bell to `src/routes/app/+layout.svelte`**

Add imports:

```ts
import BellIcon from '@lucide/svelte/icons/bell';
import { Badge } from '$lib/components/ui/badge';
```

Add two `NavigationMenu.Item`s after the Calendar item:

```svelte
<NavigationMenu.Item>
	<NavigationMenu.Link href={resolve('/app/teams' as Pathname)}>
		{m.nav_teams()}
	</NavigationMenu.Link>
</NavigationMenu.Item>
<NavigationMenu.Item>
	<NavigationMenu.Link href={resolve('/app/sharing' as Pathname)}>
		{m.nav_sharing()}
	</NavigationMenu.Link>
</NavigationMenu.Item>
```

Add the bell between the nav and the avatar dropdown — wrap the existing `DropdownMenu.Root` and the new button in a `<div class="flex items-center gap-1">`:

```svelte
<Button
	variant="ghost"
	size="icon"
	href={resolve('/app/notifications' as Pathname)}
	aria-label={m.notifications_bell_label()}
	class="relative"
>
	<BellIcon />
	{#if data.unreadCount > 0}
		<Badge
			variant="destructive"
			class="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px]"
		>
			{data.unreadCount}
		</Badge>
	{/if}
</Button>
```

Run the file through `svelte-autofixer` until clean.

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: 0 errors. (The `/app/teams` etc. routes don't exist yet; the `as Pathname` casts keep resolve() happy until they do.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/+layout.server.ts src/routes/app/+layout.svelte
git commit -m "feat(sharing): nav links and notification bell in app header"
```

---

### Task 10: Teams list page

**Files:**
- Create: `src/routes/app/teams/+page.server.ts`
- Create: `src/routes/app/teams/+page.svelte`

**Interfaces:**
- Consumes: `createTeamSchema`; `auth.api.createOrganization`; `member`, `organization` tables.
- Produces: `/app/teams` listing the user's teams with role badges + create form.

- [ ] **Step 1: Implement `src/routes/app/teams/+page.server.ts`**

```ts
import { fail, redirect as kitRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { createTeamSchema } from '$lib/schemas/team';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { member, organization } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

/** Unique, URL-safe slug; better-auth requires one per organization. */
function teamSlug(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '')
		.slice(0, 40);
	return `${base || 'team'}-${crypto.randomUUID().slice(0, 8)}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const [teams, createForm] = await Promise.all([
		db
			.select({ id: organization.id, name: organization.name, role: member.role })
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(eq(member.userId, user.id))
			.orderBy(organization.name),
		superValidate(zod4(createTeamSchema))
	]);
	return { teams, createForm };
};

export const actions: Actions = {
	create: async (event) => {
		const form = await superValidate(event.request, zod4(createTeamSchema));
		if (!form.valid) return fail(400, { form });
		requireUser(event.locals);
		try {
			await auth.api.createOrganization({
				body: { name: form.data.name, slug: teamSlug(form.data.name) },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { form });
		}
		redirect(303, '/app/teams', { type: 'success', message: m.team_created() }, event);
	}
};
```

- [ ] **Step 2: Implement `src/routes/app/teams/+page.svelte`**

```svelte
<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { createTeamSchema } from '$lib/schemas/team';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, constraints, submitting, enhance } = superForm(data.createForm, {
		validators: zod4Client(createTeamSchema)
	});

	const roleLabels: Record<string, string> = {
		owner: m.team_role_owner(),
		admin: m.team_role_admin(),
		member: m.team_role_member()
	};
</script>

<svelte:head><title>{m.teams_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<h1 class="text-2xl font-semibold">{m.teams_title()}</h1>

	{#if data.teams.length === 0}
		<Empty.Root>
			<Empty.Title>{m.teams_empty()}</Empty.Title>
		</Empty.Root>
	{:else}
		<div class="grid gap-2">
			{#each data.teams as team (team.id)}
				<Item.Root variant="outline">
					{#snippet child({ props })}
						<a href={`/app/teams/${team.id}`} {...props}>
							<Item.Content>
								<Item.Title>{team.name}</Item.Title>
							</Item.Content>
							<Item.Actions>
								<Badge variant="secondary">{roleLabels[team.role] ?? team.role}</Badge>
							</Item.Actions>
						</a>
					{/snippet}
				</Item.Root>
			{/each}
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.teams_create_title()}</Card.Title>
			<Card.Description>{m.teams_create_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" use:enhance>
				<Field.Group>
					<Field.Field data-invalid={!!$errors.name || undefined}>
						<Field.Label for="team-name">{m.team_name_label()}</Field.Label>
						<Input
							id="team-name"
							name="name"
							bind:value={$form.name}
							aria-invalid={$errors.name ? 'true' : undefined}
							{...$constraints.name}
						/>
						<Field.Error errors={toFieldErrors($errors.name)} />
					</Field.Field>
					<div>
						<Button type="submit" disabled={$submitting}>
							{#if $submitting}<Spinner />{/if}
							{m.teams_create_cta()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
</div>
```

Check the `Item` component's actual sub-component names in `src/lib/components/ui/item/index.ts` before using it; if it has no anchor `child` snippet support, use a plain `<a>` wrapping a `Card` instead. Run through `svelte-autofixer` until clean.

- [ ] **Step 3: Verify**

Run: `pnpm check && pnpm lint`
Expected: 0 errors. Then in the dev server (`pnpm dev` or preview tools): visit `/app/teams`, create a team, see it listed with an Owner badge.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/teams
git commit -m "feat(teams): teams list page with create form"
```

---

### Task 11: Team detail page

**Files:**
- Create: `src/routes/app/teams/[id]/+page.server.ts`
- Create: `src/routes/app/teams/[id]/+page.svelte`

**Interfaces:**
- Consumes: team/share schemas; `auth.api.createInvitation / removeMember / updateMemberRole / updateOrganization / deleteOrganization / leaveOrganization`; `createShare`, `getUsersByIds` (sharing.ts); `notifyShareCreated` (notifications.ts); `member`, `organization`, `invitation`, `calendarShare`, `user` tables.
- Produces: `/app/teams/[id]` — members, roles, invite, remove, transfer, rename, delete, leave, team-calendar sharing card.

- [ ] **Step 1: Implement `src/routes/app/teams/[id]/+page.server.ts`**

```ts
import { error, fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import {
	inviteMemberSchema,
	memberIdSchema,
	renameTeamSchema,
	updateRoleSchema
} from '$lib/schemas/team';
import { shareIdSchema, shareTargetSchema } from '$lib/schemas/share';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { calendarShare, invitation, member, organization, user } from '$lib/server/db/schema';
import { notifyShareCreated } from '$lib/server/notifications';
import { createShare, type ShareEntity } from '$lib/server/sharing';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

/** The caller's membership row, or 404 when they are not in this team. */
async function requireMembership(userId: string, orgId: string) {
	const rows = await db
		.select()
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);
	if (!rows[0]) error(404);
	return rows[0];
}

function requireManager(membership: { role: string }) {
	if (membership.role !== 'owner' && membership.role !== 'admin') error(403, m.error_forbidden());
}

/** Resolves share rows to display labels ("Alice", "Team Design", pending emails). */
async function describeShareTargets(
	shares: (typeof calendarShare.$inferSelect)[]
): Promise<{ id: string; label: string; pending: boolean }[]> {
	const userIds = shares.flatMap((s) => (s.targetUserId ? [s.targetUserId] : []));
	const orgIds = shares.flatMap((s) => (s.targetOrgId ? [s.targetOrgId] : []));
	const [users, orgs] = await Promise.all([
		userIds.length
			? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
			: [],
		orgIds.length
			? db
					.select({ id: organization.id, name: organization.name })
					.from(organization)
					.where(inArray(organization.id, orgIds))
			: []
	]);
	const userNames = new Map(users.map((u) => [u.id, u.name]));
	const orgNames = new Map(orgs.map((o) => [o.id, o.name]));
	return shares.map((share) => ({
		id: share.id,
		pending: share.targetEmail !== null,
		label: share.targetUserId
			? (userNames.get(share.targetUserId) ?? '')
			: share.targetOrgId
				? m.share_from_team({ name: orgNames.get(share.targetOrgId) ?? '' })
				: (share.targetEmail ?? '')
	}));
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const currentUser = requireUser(locals);
	const membership = await requireMembership(currentUser.id, params.id);
	const [team] = await db
		.select({ id: organization.id, name: organization.name })
		.from(organization)
		.where(eq(organization.id, params.id));
	if (!team) error(404);
	const [members, pendingInvitations, teamShares, myTeams] = await Promise.all([
		db
			.select({ id: member.id, userId: member.userId, role: member.role, name: user.name, email: user.email })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, params.id))
			.orderBy(user.name),
		db
			.select({ id: invitation.id, email: invitation.email, role: invitation.role })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, params.id),
					eq(invitation.status, 'pending'),
					gt(invitation.expiresAt, new Date())
				)
			),
		db
			.select()
			.from(calendarShare)
			.where(eq(calendarShare.sharerOrgId, params.id))
			.orderBy(desc(calendarShare.createdAt)),
		db
			.select({ id: organization.id, name: organization.name })
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(eq(member.userId, currentUser.id))
	]);
	const [inviteForm, roleForm, memberForm, renameForm, shareForm, revokeForm] = await Promise.all([
		superValidate(zod4(inviteMemberSchema), { id: 'invite' }),
		superValidate(zod4(updateRoleSchema), { id: 'role' }),
		superValidate(zod4(memberIdSchema), { id: 'member' }),
		superValidate({ name: team.name }, zod4(renameTeamSchema), { id: 'rename' }),
		superValidate(zod4(shareTargetSchema), { id: 'share' }),
		superValidate(zod4(shareIdSchema), { id: 'revoke' })
	]);
	return {
		team,
		members,
		pendingInvitations,
		shares: await describeShareTargets(teamShares),
		// Teams the team calendar could be shared with (exclude this team itself).
		shareableTeams: myTeams.filter((t) => t.id !== params.id),
		myRole: membership.role,
		myMemberId: membership.id,
		inviteForm,
		roleForm,
		memberForm,
		renameForm,
		shareForm,
		revokeForm
	};
};

const teamPath = (id: string) => `/app/teams/${id}`;

export const actions: Actions = {
	invite: async (event) => {
		const form = await superValidate(event.request, zod4(inviteMemberSchema), { id: 'invite' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		try {
			await auth.api.createInvitation({
				body: {
					email: form.data.email,
					role: form.data.role,
					organizationId: event.params.id,
					resend: true
				},
				headers: event.request.headers
			});
		} catch {
			return fail(400, { form });
		}
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.team_invite_sent() }, event);
	},

	removeMember: async (event) => {
		const form = await superValidate(event.request, zod4(memberIdSchema), { id: 'member' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		try {
			await auth.api.removeMember({
				body: { memberIdOrEmail: form.data.memberId, organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { form });
		}
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.team_member_removed() }, event);
	},

	updateRole: async (event) => {
		const form = await superValidate(event.request, zod4(updateRoleSchema), { id: 'role' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		try {
			await auth.api.updateMemberRole({
				body: {
					memberId: form.data.memberId,
					role: form.data.role,
					organizationId: event.params.id
				},
				headers: event.request.headers
			});
		} catch {
			return fail(400, { form });
		}
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.team_role_updated() }, event);
	},

	transferOwnership: async (event) => {
		const form = await superValidate(event.request, zod4(memberIdSchema), { id: 'member' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const membership = await requireMembership(currentUser.id, event.params.id);
		if (membership.role !== 'owner') error(403, m.error_forbidden());
		try {
			await auth.api.updateMemberRole({
				body: { memberId: form.data.memberId, role: 'owner', organizationId: event.params.id },
				headers: event.request.headers
			});
			await auth.api.updateMemberRole({
				body: { memberId: membership.id, role: 'admin', organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { form });
		}
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.team_transferred() }, event);
	},

	rename: async (event) => {
		const form = await superValidate(event.request, zod4(renameTeamSchema), { id: 'rename' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const membership = await requireMembership(currentUser.id, event.params.id);
		if (membership.role !== 'owner') error(403, m.error_forbidden());
		try {
			await auth.api.updateOrganization({
				body: { organizationId: event.params.id, data: { name: form.data.name } },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { form });
		}
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.team_renamed() }, event);
	},

	deleteTeam: async (event) => {
		const currentUser = requireUser(event.locals);
		const membership = await requireMembership(currentUser.id, event.params.id);
		if (membership.role !== 'owner') error(403, m.error_forbidden());
		try {
			await auth.api.deleteOrganization({
				body: { organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch {
			return fail(400, {});
		}
		redirect(303, '/app/teams', { type: 'success', message: m.team_deleted() }, event);
	},

	leave: async (event) => {
		const currentUser = requireUser(event.locals);
		await requireMembership(currentUser.id, event.params.id);
		try {
			await auth.api.leaveOrganization({
				body: { organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch {
			return fail(400, {});
		}
		redirect(303, '/app/teams', { type: 'success', message: m.team_left() }, event);
	},

	share: async (event) => {
		const form = await superValidate(event.request, zod4(shareTargetSchema), { id: 'share' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));

		let target: ShareEntity;
		if (form.data.targetType === 'team') {
			if (form.data.teamId === event.params.id) return fail(400, { form });
			target = { type: 'org', id: form.data.teamId };
		} else {
			const [existing] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, form.data.email))
				.limit(1);
			target = existing
				? { type: 'user', id: existing.id }
				: { type: 'email', email: form.data.email };
		}
		const [team] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, event.params.id));
		const created = await createShare({ type: 'org', id: event.params.id }, target, currentUser.id);
		if (created === 'duplicate') {
			redirect(303, teamPath(event.params.id), { type: 'error', message: m.share_duplicate() }, event);
		}
		await notifyShareCreated(created.id, team?.name ?? '', target);
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.share_created() }, event);
	},

	revokeShare: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'revoke' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		const deleted = await db
			.delete(calendarShare)
			.where(and(eq(calendarShare.id, form.data.id), eq(calendarShare.sharerOrgId, event.params.id)))
			.returning({ id: calendarShare.id });
		if (deleted.length === 0) error(404);
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.share_revoked() }, event);
	}
};
```

Note: check the exact `removeMember` body key in the installed better-auth version (`memberIdOrEmail` vs `memberId`) by inspecting `node_modules/better-auth`'s types; use what the types require.

- [ ] **Step 2: Implement `src/routes/app/teams/[id]/+page.svelte`**

Cards top-to-bottom: Members, Invite (managers), Pending invitations (managers), Team calendar sharing (managers), Team settings (rename owner-only, transfer via row buttons, delete owner-only / leave everyone). Use `Select` for roles, `AlertDialog` for transfer/delete/leave confirmations, plain per-row forms (`method="POST"` + hidden inputs) for row actions — superforms enhancement is only needed on the invite/rename/share forms.

```svelte
<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { shareTargetSchema } from '$lib/schemas/share';
	import { inviteMemberSchema, renameTeamSchema } from '$lib/schemas/team';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	const canManage = $derived(data.myRole === 'owner' || data.myRole === 'admin');
	const isOwner = $derived(data.myRole === 'owner');

	const roleLabels: Record<string, string> = {
		owner: m.team_role_owner(),
		admin: m.team_role_admin(),
		member: m.team_role_member()
	};

	// svelte-ignore state_referenced_locally
	const invite = superForm(data.inviteForm, {
		id: 'invite',
		validators: zod4Client(inviteMemberSchema)
	});
	const { form: inviteData, errors: inviteErrors, submitting: inviteSubmitting, enhance: inviteEnhance } = invite;

	// svelte-ignore state_referenced_locally
	const rename = superForm(data.renameForm, {
		id: 'rename',
		validators: zod4Client(renameTeamSchema)
	});
	const { form: renameData, errors: renameErrors, submitting: renameSubmitting, enhance: renameEnhance } = rename;

	// svelte-ignore state_referenced_locally
	const share = superForm(data.shareForm, {
		id: 'share',
		validators: zod4Client(shareTargetSchema)
	});
	const { form: shareData, errors: shareErrors, submitting: shareSubmitting, enhance: shareEnhance } = share;

	const selectedTeamName = $derived(
		data.shareableTeams.find((team) => team.id === $shareData.teamId)?.name ?? ''
	);
</script>

<svelte:head><title>{data.team.name} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<h1 class="text-2xl font-semibold">{data.team.name}</h1>

	<Card.Root>
		<Card.Header><Card.Title>{m.team_members_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-2">
			{#each data.members as teamMember (teamMember.id)}
				<Item.Root variant="outline">
					<Item.Content>
						<Item.Title>{teamMember.name}</Item.Title>
						<Item.Description>{teamMember.email}</Item.Description>
					</Item.Content>
					<Item.Actions>
						{#if canManage && teamMember.role !== 'owner' && teamMember.userId !== data.user.id}
							<form method="POST" action="?/updateRole" class="contents">
								<input type="hidden" name="memberId" value={teamMember.id} />
								<Select.Root
									type="single"
									value={teamMember.role}
									onValueChange={(role) => {
										const form = document.getElementById(`role-form-${teamMember.id}`);
										const input = form?.querySelector('input[name="role"]');
										if (input instanceof HTMLInputElement && role) {
											input.value = role;
											form?.requestSubmit();
										}
									}}
								>
									<Select.Trigger class="w-28">{roleLabels[teamMember.role]}</Select.Trigger>
									<Select.Content>
										<Select.Item value="member">{m.team_role_member()}</Select.Item>
										<Select.Item value="admin">{m.team_role_admin()}</Select.Item>
									</Select.Content>
								</Select.Root>
							</form>
							{#if isOwner}
								<AlertDialog.Root>
									<AlertDialog.Trigger>
										{#snippet child({ props })}
											<Button {...props} variant="outline" size="sm">{m.team_transfer_cta()}</Button>
										{/snippet}
									</AlertDialog.Trigger>
									<AlertDialog.Content>
										<AlertDialog.Header>
											<AlertDialog.Title>{m.team_transfer_confirm_title()}</AlertDialog.Title>
											<AlertDialog.Description>
												{m.team_transfer_confirm_description({ name: teamMember.name })}
											</AlertDialog.Description>
										</AlertDialog.Header>
										<AlertDialog.Footer>
											<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
											<form method="POST" action="?/transferOwnership">
												<input type="hidden" name="memberId" value={teamMember.id} />
												<Button type="submit">{m.team_transfer_cta()}</Button>
											</form>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Root>
							{/if}
							<form method="POST" action="?/removeMember">
								<input type="hidden" name="memberId" value={teamMember.id} />
								<Button type="submit" variant="ghost" size="sm">{m.team_member_remove()}</Button>
							</form>
						{:else}
							<Badge variant="secondary">{roleLabels[teamMember.role] ?? teamMember.role}</Badge>
						{/if}
					</Item.Actions>
				</Item.Root>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if canManage}
		<Card.Root>
			<Card.Header><Card.Title>{m.team_invite_title()}</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/invite" use:inviteEnhance>
					<Field.Group>
						<Field.Field data-invalid={!!$inviteErrors.email || undefined}>
							<Field.Label for="invite-email">{m.share_email_label()}</Field.Label>
							<Input
								id="invite-email"
								type="email"
								name="email"
								bind:value={$inviteData.email}
								aria-invalid={$inviteErrors.email ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($inviteErrors.email)} />
						</Field.Field>
						<Field.Field>
							<Field.Label for="invite-role">{m.team_invite_role_label()}</Field.Label>
							<Select.Root type="single" name="role" bind:value={$inviteData.role}>
								<Select.Trigger id="invite-role" class="w-full">
									{roleLabels[$inviteData.role] ?? m.team_role_member()}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="member">{m.team_role_member()}</Select.Item>
									<Select.Item value="admin">{m.team_role_admin()}</Select.Item>
								</Select.Content>
							</Select.Root>
						</Field.Field>
						<div>
							<Button type="submit" disabled={$inviteSubmitting}>
								{#if $inviteSubmitting}<Spinner />{/if}
								{m.team_invite_cta()}
							</Button>
						</div>
					</Field.Group>
				</form>
				{#if data.pendingInvitations.length > 0}
					<div class="mt-4 grid gap-2">
						<h3 class="text-sm font-medium">{m.team_pending_invites_title()}</h3>
						{#each data.pendingInvitations as pending (pending.id)}
							<Item.Root variant="muted">
								<Item.Content>
									<Item.Title>{pending.email}</Item.Title>
								</Item.Content>
								<Item.Actions>
									<Badge variant="outline">{roleLabels[pending.role ?? 'member']}</Badge>
								</Item.Actions>
							</Item.Root>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.team_share_title()}</Card.Title>
				<Card.Description>{m.team_share_description()}</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<form method="POST" action="?/share" use:shareEnhance>
					<Field.Group>
						<Field.Field>
							<Field.Label>{m.share_target_label()}</Field.Label>
							<RadioGroup.Root bind:value={$shareData.targetType} name="targetType" class="flex gap-4">
								<Field.Label class="flex items-center gap-2 font-normal">
									<RadioGroup.Item value="person" />
									{m.share_target_person()}
								</Field.Label>
								<Field.Label class="flex items-center gap-2 font-normal">
									<RadioGroup.Item value="team" />
									{m.share_target_team()}
								</Field.Label>
							</RadioGroup.Root>
						</Field.Field>
						{#if $shareData.targetType === 'team'}
							<Field.Field data-invalid={!!$shareErrors.teamId || undefined}>
								<Field.Label for="team-share-team">{m.share_team_label()}</Field.Label>
								<Select.Root type="single" name="teamId" bind:value={$shareData.teamId}>
									<Select.Trigger id="team-share-team" class="w-full">{selectedTeamName}</Select.Trigger>
									<Select.Content>
										{#each data.shareableTeams as team (team.id)}
											<Select.Item value={team.id}>{team.name}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<Field.Error errors={toFieldErrors($shareErrors.teamId)} />
							</Field.Field>
						{:else}
							<Field.Field data-invalid={!!$shareErrors.email || undefined}>
								<Field.Label for="team-share-email">{m.share_email_label()}</Field.Label>
								<Input
									id="team-share-email"
									type="email"
									name="email"
									bind:value={$shareData.email}
									aria-invalid={$shareErrors.email ? 'true' : undefined}
								/>
								<Field.Error errors={toFieldErrors($shareErrors.email)} />
							</Field.Field>
						{/if}
						<div>
							<Button type="submit" disabled={$shareSubmitting}>
								{#if $shareSubmitting}<Spinner />{/if}
								{m.share_cta()}
							</Button>
						</div>
					</Field.Group>
				</form>
				{#if data.shares.length > 0}
					<div class="grid gap-2">
						{#each data.shares as teamShare (teamShare.id)}
							<Item.Root variant="outline">
								<Item.Content>
									<Item.Title>{teamShare.label}</Item.Title>
									{#if teamShare.pending}
										<Item.Description>{m.share_pending()}</Item.Description>
									{/if}
								</Item.Content>
								<Item.Actions>
									<form method="POST" action="?/revokeShare">
										<input type="hidden" name="id" value={teamShare.id} />
										<Button type="submit" variant="ghost" size="sm">{m.share_revoke()}</Button>
									</form>
								</Item.Actions>
							</Item.Root>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header><Card.Title>{m.team_settings_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-4">
			{#if isOwner}
				<form method="POST" action="?/rename" use:renameEnhance>
					<Field.Group>
						<Field.Field data-invalid={!!$renameErrors.name || undefined}>
							<Field.Label for="rename-name">{m.team_name_label()}</Field.Label>
							<Input id="rename-name" name="name" bind:value={$renameData.name} />
							<Field.Error errors={toFieldErrors($renameErrors.name)} />
						</Field.Field>
						<div>
							<Button type="submit" variant="outline" disabled={$renameSubmitting}>
								{#if $renameSubmitting}<Spinner />{/if}
								{m.team_rename_cta()}
							</Button>
						</div>
					</Field.Group>
				</form>
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="destructive" class="justify-self-start">
								{m.team_delete_cta()}
							</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.team_delete_confirm_title()}</AlertDialog.Title>
							<AlertDialog.Description>{m.team_delete_confirm_description()}</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
							<form method="POST" action="?/deleteTeam">
								<Button type="submit" variant="destructive">{m.team_delete_cta()}</Button>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{:else}
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="outline" class="justify-self-start">
								{m.team_leave_cta()}
							</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.team_leave_confirm_title()}</AlertDialog.Title>
							<AlertDialog.Description>{m.team_leave_confirm_description()}</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
							<form method="POST" action="?/leave">
								<Button type="submit">{m.team_leave_cta()}</Button>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
```

Implementation notes for this step:
- The role-change `Select` inside a form needs the form id wiring shown (`id="role-form-{teamMember.id}"` on the form and a hidden `role` input) — add both; the snippet above shows the intent, make the ids consistent.
- The owner cannot be role-changed or removed; the current user manages themselves only via Leave.
- Verify `Item`/`RadioGroup` sub-component names against `src/lib/components/ui/*/index.ts` before use.
- Run through `svelte-autofixer` until clean.

- [ ] **Step 3: Verify in the browser**

Run: `pnpm check && pnpm lint`, then with the dev server: create a second user (sign up in a private window), invite them, accept from their account (Task 13's page not built yet — accept via the pending invitation listed there later; for now verify the invite email is logged to the dev console and the invitation row appears under Pending invitations). Rename, role changes, transfer, leave, delete — all against the real dev Postgres.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/teams
git commit -m "feat(teams): team detail page with members, roles, invites, and team sharing"
```

---

### Task 12: Personal sharing page

**Files:**
- Create: `src/routes/app/sharing/+page.server.ts`
- Create: `src/routes/app/sharing/+page.svelte`

**Interfaces:**
- Consumes: `shareTargetSchema`, `shareIdSchema`; `createShare`, `ShareEntity` (sharing.ts); `notifyShareCreated` (notifications.ts); `calendarShare`, `calendarShareHide`, `member`, `organization`, `user` tables.
- Produces: `/app/sharing` — share personal calendar with a person/team; "Shared by you" (revoke); "Shared with you" (hide/unhide).

- [ ] **Step 1: Implement `src/routes/app/sharing/+page.server.ts`**

```ts
import { error, fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { shareIdSchema, shareTargetSchema } from '$lib/schemas/share';
import { db } from '$lib/server/db';
import {
	calendarShare,
	calendarShareHide,
	member,
	organization,
	user
} from '$lib/server/db/schema';
import { notifyShareCreated } from '$lib/server/notifications';
import { createShare, type ShareEntity } from '$lib/server/sharing';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

/** Name lookup maps for rendering share rows. */
async function nameMaps(userIds: string[], orgIds: string[]) {
	const [users, orgs] = await Promise.all([
		userIds.length
			? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
			: [],
		orgIds.length
			? db
					.select({ id: organization.id, name: organization.name })
					.from(organization)
					.where(inArray(organization.id, orgIds))
			: []
	]);
	return {
		userNames: new Map(users.map((u) => [u.id, u.name])),
		orgNames: new Map(orgs.map((o) => [o.id, o.name]))
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const currentUser = requireUser(locals);
	const myOrgRows = await db
		.select({ id: organization.id, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, currentUser.id));
	const myOrgIds = myOrgRows.map((row) => row.id);

	const receivedFilters = [eq(calendarShare.targetUserId, currentUser.id)];
	if (myOrgIds.length > 0) receivedFilters.push(inArray(calendarShare.targetOrgId, myOrgIds));

	const [given, received] = await Promise.all([
		db
			.select()
			.from(calendarShare)
			.where(eq(calendarShare.sharerUserId, currentUser.id))
			.orderBy(desc(calendarShare.createdAt)),
		db
			.select({ share: calendarShare, hiddenBy: calendarShareHide.userId })
			.from(calendarShare)
			.leftJoin(
				calendarShareHide,
				and(
					eq(calendarShareHide.shareId, calendarShare.id),
					eq(calendarShareHide.userId, currentUser.id)
				)
			)
			.where(or(...receivedFilters))
			.orderBy(desc(calendarShare.createdAt))
	]);

	const { userNames, orgNames } = await nameMaps(
		[
			...given.flatMap((s) => (s.targetUserId ? [s.targetUserId] : [])),
			...received.flatMap((r) => (r.share.sharerUserId ? [r.share.sharerUserId] : []))
		],
		[
			...given.flatMap((s) => (s.targetOrgId ? [s.targetOrgId] : [])),
			...received.flatMap((r) => (r.share.sharerOrgId ? [r.share.sharerOrgId] : []))
		]
	);

	const [shareForm, revokeForm, hideForm] = await Promise.all([
		superValidate(zod4(shareTargetSchema), { id: 'share' }),
		superValidate(zod4(shareIdSchema), { id: 'revoke' }),
		superValidate(zod4(shareIdSchema), { id: 'hide' })
	]);

	return {
		myTeams: myOrgRows,
		givenShares: given.map((share) => ({
			id: share.id,
			pending: share.targetEmail !== null,
			label: share.targetUserId
				? (userNames.get(share.targetUserId) ?? '')
				: share.targetOrgId
					? m.share_from_team({ name: orgNames.get(share.targetOrgId) ?? '' })
					: (share.targetEmail ?? '')
		})),
		receivedShares: received.map(({ share, hiddenBy }) => ({
			id: share.id,
			hidden: hiddenBy !== null,
			label: share.sharerUserId
				? (userNames.get(share.sharerUserId) ?? '')
				: m.share_from_team({ name: orgNames.get(share.sharerOrgId ?? '') ?? '' })
		})),
		shareForm,
		revokeForm,
		hideForm
	};
};

export const actions: Actions = {
	share: async (event) => {
		const form = await superValidate(event.request, zod4(shareTargetSchema), { id: 'share' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);

		let target: ShareEntity;
		if (form.data.targetType === 'team') {
			target = { type: 'org', id: form.data.teamId };
		} else {
			if (form.data.email.toLowerCase() === currentUser.email.toLowerCase()) {
				redirect(303, '/app/sharing', { type: 'error', message: m.share_self() }, event);
			}
			const [existing] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, form.data.email))
				.limit(1);
			target = existing
				? { type: 'user', id: existing.id }
				: { type: 'email', email: form.data.email };
		}
		const created = await createShare(
			{ type: 'user', id: currentUser.id },
			target,
			currentUser.id
		);
		if (created === 'duplicate') {
			redirect(303, '/app/sharing', { type: 'error', message: m.share_duplicate() }, event);
		}
		await notifyShareCreated(created.id, currentUser.name, target);
		redirect(303, '/app/sharing', { type: 'success', message: m.share_created() }, event);
	},

	revoke: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'revoke' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const deleted = await db
			.delete(calendarShare)
			.where(
				and(eq(calendarShare.id, form.data.id), eq(calendarShare.sharerUserId, currentUser.id))
			)
			.returning({ id: calendarShare.id });
		if (deleted.length === 0) error(404);
		redirect(303, '/app/sharing', { type: 'success', message: m.share_revoked() }, event);
	},

	hide: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'hide' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		await db
			.insert(calendarShareHide)
			.values({ userId: currentUser.id, shareId: form.data.id })
			.onConflictDoNothing();
		redirect(303, '/app/sharing', { type: 'success', message: m.share_hidden() }, event);
	},

	unhide: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'hide' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		await db
			.delete(calendarShareHide)
			.where(
				and(
					eq(calendarShareHide.userId, currentUser.id),
					eq(calendarShareHide.shareId, form.data.id)
				)
			);
		redirect(303, '/app/sharing', { type: 'success', message: m.share_unhidden() }, event);
	}
};
```

- [ ] **Step 2: Implement `src/routes/app/sharing/+page.svelte`**

Same structure as the team-share card from Task 11 (person/team radio → email input or team select), followed by two list cards. Reuse the exact form pattern; the team select lists `data.myTeams`.

```svelte
<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { shareTargetSchema } from '$lib/schemas/share';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, submitting, enhance } = superForm(data.shareForm, {
		id: 'share',
		validators: zod4Client(shareTargetSchema)
	});

	const selectedTeamName = $derived(
		data.myTeams.find((team) => team.id === $form.teamId)?.name ?? ''
	);
</script>

<svelte:head><title>{m.sharing_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<h1 class="text-2xl font-semibold">{m.sharing_title()}</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.share_form_title()}</Card.Title>
			<Card.Description>{m.share_form_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/share" use:enhance>
				<Field.Group>
					<Field.Field>
						<Field.Label>{m.share_target_label()}</Field.Label>
						<RadioGroup.Root bind:value={$form.targetType} name="targetType" class="flex gap-4">
							<Field.Label class="flex items-center gap-2 font-normal">
								<RadioGroup.Item value="person" />
								{m.share_target_person()}
							</Field.Label>
							<Field.Label class="flex items-center gap-2 font-normal">
								<RadioGroup.Item value="team" />
								{m.share_target_team()}
							</Field.Label>
						</RadioGroup.Root>
					</Field.Field>
					{#if $form.targetType === 'team'}
						<Field.Field data-invalid={!!$errors.teamId || undefined}>
							<Field.Label for="share-team">{m.share_team_label()}</Field.Label>
							<Select.Root type="single" name="teamId" bind:value={$form.teamId}>
								<Select.Trigger id="share-team" class="w-full">{selectedTeamName}</Select.Trigger>
								<Select.Content>
									{#each data.myTeams as team (team.id)}
										<Select.Item value={team.id}>{team.name}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<Field.Error errors={toFieldErrors($errors.teamId)} />
						</Field.Field>
					{:else}
						<Field.Field data-invalid={!!$errors.email || undefined}>
							<Field.Label for="share-email">{m.share_email_label()}</Field.Label>
							<Input
								id="share-email"
								type="email"
								name="email"
								bind:value={$form.email}
								aria-invalid={$errors.email ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($errors.email)} />
						</Field.Field>
					{/if}
					<div>
						<Button type="submit" disabled={$submitting}>
							{#if $submitting}<Spinner />{/if}
							{m.share_cta()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>{m.share_by_you_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-2">
			{#if data.givenShares.length === 0}
				<p class="text-muted-foreground text-sm">{m.share_empty()}</p>
			{/if}
			{#each data.givenShares as share (share.id)}
				<Item.Root variant="outline">
					<Item.Content>
						<Item.Title>{share.label}</Item.Title>
						{#if share.pending}
							<Item.Description>{m.share_pending()}</Item.Description>
						{/if}
					</Item.Content>
					<Item.Actions>
						<form method="POST" action="?/revoke">
							<input type="hidden" name="id" value={share.id} />
							<Button type="submit" variant="ghost" size="sm">{m.share_revoke()}</Button>
						</form>
					</Item.Actions>
				</Item.Root>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>{m.share_with_you_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-2">
			{#if data.receivedShares.length === 0}
				<p class="text-muted-foreground text-sm">{m.share_empty()}</p>
			{/if}
			{#each data.receivedShares as share (share.id)}
				<Item.Root variant="outline">
					<Item.Content>
						<Item.Title>{share.label}</Item.Title>
						{#if share.hidden}
							<Badge variant="outline">{m.share_hidden()}</Badge>
						{/if}
					</Item.Content>
					<Item.Actions>
						<form method="POST" action={share.hidden ? '?/unhide' : '?/hide'}>
							<input type="hidden" name="id" value={share.id} />
							<Button type="submit" variant="ghost" size="sm">
								{share.hidden ? m.share_unhide() : m.share_hide()}
							</Button>
						</form>
					</Item.Actions>
				</Item.Root>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
```

Run through `svelte-autofixer` until clean.

- [ ] **Step 3: Verify in the browser**

`pnpm check && pnpm lint`, then: share with the second user's email (in-app + logged email appear), share with an unregistered email (pending badge), revoke, hide/unhide a received share. Verify rows in dev Postgres.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/sharing
git commit -m "feat(sharing): personal sharing page with revoke and hide"
```

---

### Task 13: Notifications page

**Files:**
- Create: `src/routes/app/notifications/+page.server.ts`
- Create: `src/routes/app/notifications/+page.svelte`

**Interfaces:**
- Consumes: `shareBackSchema`, `invitationActionSchema`; `auth.api.acceptInvitation / rejectInvitation`; `createShare` (sharing.ts); `notifyShareCreated` (notifications.ts); `notification`, `calendarShare`, `invitation`, `organization` tables.
- Produces: `/app/notifications` — list with per-type text, Accept/Decline for invites, Share-back for shares, mark-all-read.

- [ ] **Step 1: Implement `src/routes/app/notifications/+page.server.ts`**

```ts
import { fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { invitationActionSchema } from '$lib/schemas/team';
import { shareBackSchema } from '$lib/schemas/share';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { calendarShare, invitation, notification, organization } from '$lib/server/db/schema';
import { notifyShareCreated } from '$lib/server/notifications';
import { createShare, type ShareEntity } from '$lib/server/sharing';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals }) => {
	const currentUser = requireUser(locals);
	const [notifications, pendingInvitations, shareBackForm, invitationForm] = await Promise.all([
		db
			.select()
			.from(notification)
			.where(eq(notification.userId, currentUser.id))
			.orderBy(desc(notification.createdAt))
			.limit(50),
		db
			.select({ id: invitation.id, teamName: organization.name })
			.from(invitation)
			.innerJoin(organization, eq(invitation.organizationId, organization.id))
			.where(
				and(
					eq(invitation.email, currentUser.email),
					eq(invitation.status, 'pending'),
					gt(invitation.expiresAt, new Date())
				)
			),
		superValidate(zod4(shareBackSchema), { id: 'share-back' }),
		superValidate(zod4(invitationActionSchema), { id: 'invitation' })
	]);
	// Pending invitation ids: a team_invite notification only shows Accept/Decline
	// while its invitation is still actionable.
	return {
		notifications,
		pendingInvitationIds: pendingInvitations.map((row) => row.id),
		shareBackForm,
		invitationForm
	};
};

const PATH = '/app/notifications';

export const actions: Actions = {
	shareBack: async (event) => {
		const form = await superValidate(event.request, zod4(shareBackSchema), { id: 'share-back' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const [row] = await db
			.select()
			.from(notification)
			.where(
				and(
					eq(notification.id, form.data.notificationId),
					eq(notification.userId, currentUser.id),
					eq(notification.type, 'calendar_shared')
				)
			);
		const shareId = row?.data.shareId;
		if (!shareId) return fail(404, { form });
		const [originalShare] = await db
			.select()
			.from(calendarShare)
			.where(eq(calendarShare.id, shareId));
		if (!originalShare) {
			redirect(303, PATH, { type: 'error', message: m.invitation_gone() }, event);
		}
		const target: ShareEntity = originalShare.sharerUserId
			? { type: 'user', id: originalShare.sharerUserId }
			: { type: 'org', id: originalShare.sharerOrgId! };
		const created = await createShare(
			{ type: 'user', id: currentUser.id },
			target,
			currentUser.id
		);
		if (created !== 'duplicate') {
			await notifyShareCreated(created.id, currentUser.name, target);
		}
		redirect(303, PATH, { type: 'success', message: m.share_back_done() }, event);
	},

	acceptInvitation: async (event) => {
		const form = await superValidate(event.request, zod4(invitationActionSchema), {
			id: 'invitation'
		});
		if (!form.valid) return fail(400, { form });
		requireUser(event.locals);
		try {
			await auth.api.acceptInvitation({
				body: { invitationId: form.data.invitationId },
				headers: event.request.headers
			});
		} catch {
			redirect(303, PATH, { type: 'error', message: m.invitation_gone() }, event);
		}
		redirect(303, PATH, { type: 'success', message: m.invitation_accepted() }, event);
	},

	declineInvitation: async (event) => {
		const form = await superValidate(event.request, zod4(invitationActionSchema), {
			id: 'invitation'
		});
		if (!form.valid) return fail(400, { form });
		requireUser(event.locals);
		try {
			await auth.api.rejectInvitation({
				body: { invitationId: form.data.invitationId },
				headers: event.request.headers
			});
		} catch {
			redirect(303, PATH, { type: 'error', message: m.invitation_gone() }, event);
		}
		redirect(303, PATH, { type: 'success', message: m.invitation_declined() }, event);
	},

	markAllRead: async (event) => {
		const currentUser = requireUser(event.locals);
		await db
			.update(notification)
			.set({ readAt: new Date() })
			.where(and(eq(notification.userId, currentUser.id), isNull(notification.readAt)));
		redirect(303, PATH, { type: 'success', message: m.notifications_mark_all_read() }, event);
	}
};
```

- [ ] **Step 2: Implement `src/routes/app/notifications/+page.svelte`**

```svelte
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	type Notification = (typeof data.notifications)[number];

	const pendingIds = $derived(new Set(data.pendingInvitationIds));
	const hasUnread = $derived(data.notifications.some((n) => n.readAt === null));

	function text(entry: Notification): string {
		switch (entry.type) {
			case 'team_invite':
				return m.notification_team_invite({
					name: entry.actorName,
					team: entry.data.teamName ?? ''
				});
			case 'calendar_shared':
				return m.notification_calendar_shared({ name: entry.actorName });
			case 'event_created':
				return m.notification_event_created({ name: entry.actorName });
			case 'event_updated':
				return m.notification_event_updated({ name: entry.actorName });
		}
	}

	const dateFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
</script>

<svelte:head><title>{m.notifications_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">{m.notifications_title()}</h1>
		{#if hasUnread}
			<form method="POST" action="?/markAllRead">
				<Button type="submit" variant="outline" size="sm">{m.notifications_mark_all_read()}</Button>
			</form>
		{/if}
	</div>

	{#if data.notifications.length === 0}
		<Empty.Root>
			<Empty.Title>{m.notifications_empty()}</Empty.Title>
		</Empty.Root>
	{:else}
		<div class="grid gap-2">
			{#each data.notifications as entry (entry.id)}
				<Item.Root variant={entry.readAt === null ? 'outline' : 'muted'}>
					<Item.Content>
						<Item.Title>{text(entry)}</Item.Title>
						<Item.Description>
							{dateFormat.format(entry.createdAt)}
							{#if entry.data.eventTitle}
								· {entry.data.eventTitle}
							{/if}
						</Item.Description>
					</Item.Content>
					<Item.Actions>
						{#if entry.readAt === null}
							<Badge variant="default" class="h-2 w-2 rounded-full p-0" />
						{/if}
						{#if entry.type === 'team_invite' && entry.data.invitationId && pendingIds.has(entry.data.invitationId)}
							<form method="POST" action="?/acceptInvitation">
								<input type="hidden" name="invitationId" value={entry.data.invitationId} />
								<Button type="submit" size="sm">{m.invitation_accept()}</Button>
							</form>
							<form method="POST" action="?/declineInvitation">
								<input type="hidden" name="invitationId" value={entry.data.invitationId} />
								<Button type="submit" variant="ghost" size="sm">{m.invitation_decline()}</Button>
							</form>
						{/if}
						{#if entry.type === 'calendar_shared' && entry.data.shareId}
							<form method="POST" action="?/shareBack">
								<input type="hidden" name="notificationId" value={entry.id} />
								<Button type="submit" variant="outline" size="sm">{m.share_back_cta()}</Button>
							</form>
						{/if}
					</Item.Actions>
				</Item.Root>
			{/each}
		</div>
	{/if}
</div>
```

Run through `svelte-autofixer` until clean.

- [ ] **Step 3: Verify in the browser**

`pnpm check && pnpm lint`, then as the second user: see the team-invite notification with Accept/Decline (accept joins the team — check `/app/teams`), see the calendar-shared notification, click Share-back (a reciprocal share appears for the first user with its own notification), mark all read (bell badge clears).

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/notifications
git commit -m "feat(sharing): notifications page with invite and share-back actions"
```

---

### Task 14: Calendar integration — visibility, filter, read-only events, fan-out

**Files:**
- Modify: `src/routes/app/calendar/+page.server.ts`
- Modify: `src/routes/app/calendar/+page.svelte`

**Interfaces:**
- Consumes: `getVisibleOwners` (sharing.ts); `notifyEventChange` (notifications.ts); existing event forms/schemas (unchanged).
- Produces: calendar shows the visibility union; `filter` query param (`all` | `mine` | `teams` | `shared`); others' events read-only with owner name in the chip; create/update/move dispatch notifications.

- [ ] **Step 1: Extend `src/routes/app/calendar/+page.server.ts`**

Add imports:

```ts
import { inArray } from 'drizzle-orm';
import { user as userTable } from '$lib/server/db/schema';
import { notifyEventChange } from '$lib/server/notifications';
import { getVisibleOwners } from '$lib/server/sharing';
```

Add a filter concept next to `VIEWS`:

```ts
const FILTERS = ['all', 'mine', 'teams', 'shared'] as const;
export type CalendarFilter = (typeof FILTERS)[number];
```

Extend `calendarState` and `calendarPath` so filter survives the POST/redirect cycle exactly like view/date:

```ts
function calendarState(
	url: URL,
	timezone: string
): { view: CalendarView; date: CalendarDate; filter: CalendarFilter } {
	const viewParam = url.searchParams.get('view') as CalendarView | null;
	const view: CalendarView = viewParam && VIEWS.includes(viewParam) ? viewParam : 'month';
	const filterParam = url.searchParams.get('filter') as CalendarFilter | null;
	const filter: CalendarFilter = filterParam && FILTERS.includes(filterParam) ? filterParam : 'all';
	let date: CalendarDate;
	try {
		date = parseDate(url.searchParams.get('date') ?? '');
	} catch {
		date = today(safeTimezone(timezone));
	}
	return { view, date, filter };
}

function calendarPath(url: URL, timezone: string): string {
	const { view, date, filter } = calendarState(url, timezone);
	return `/app/calendar?view=${view}&date=${date.toString()}&filter=${filter}`;
}
```

Replace the load's records query:

```ts
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const { view, date, filter } = calendarState(url, user.timezone);
	const owners = await getVisibleOwners(user.id);
	const ownerIds =
		filter === 'mine'
			? [user.id]
			: filter === 'teams'
				? owners.filter((o) => o.via === 'team').map((o) => o.id)
				: filter === 'shared'
					? owners.filter((o) => o.via === 'share').map((o) => o.id)
					: [user.id, ...owners.map((o) => o.id)];
	const [records, eventForm, deleteForm, moveForm] = await Promise.all([
		ownerIds.length === 0
			? []
			: db
					.select({
						id: calendarEvent.id,
						type: calendarEvent.type,
						title: calendarEvent.title,
						allDay: calendarEvent.allDay,
						start: calendarEvent.start,
						end: calendarEvent.end,
						ownerId: calendarEvent.userId,
						ownerName: userTable.name
					})
					.from(calendarEvent)
					.innerJoin(userTable, eq(calendarEvent.userId, userTable.id))
					.where(inArray(calendarEvent.userId, ownerIds))
					.orderBy(asc(calendarEvent.start)),
		superValidate(zod4(eventSchema), { id: 'event' }),
		superValidate(zod4(deleteEventSchema), { id: 'delete' }),
		superValidate(zod4(moveEventSchema), { id: 'move' })
	]);
	return { view, date: date.toString(), filter, records, eventForm, deleteForm, moveForm };
};
```

Add fan-out to the `save` action right before its redirect (both create and update branches share it):

```ts
await notifyEventChange(
	{ id: user.id, name: user.name },
	form.data.id === '' ? 'created' : 'updated',
	values.title,
	values.type
);
```

And to the `move` action before its redirect — have the move update `.returning()` also select `type` and `title`, then:

```ts
await notifyEventChange({ id: user.id, name: user.name }, 'updated', updated[0].title, updated[0].type);
```

`locals.user.name` exists on the better-auth session user. The `delete` action stays notification-free (spec covers create/modify only).

- [ ] **Step 2: Extend `src/routes/app/calendar/+page.svelte`**

Add a filter state + toggle group and make others' events read-only:

```ts
import * as ToggleGroup from '$lib/components/ui/toggle-group';
// svelte-ignore state_referenced_locally
let filter = $state(data.filter);

const filterLabels = {
	all: m.calendar_filter_all(),
	mine: m.calendar_filter_mine(),
	teams: m.calendar_filter_teams(),
	shared: m.calendar_filter_shared()
} as const;
```

Replace the `events` derived so foreign events get the owner's name and become immovable:

```ts
const events = $derived(
	data.records.map((record) => {
		const event = toCalendarEvent(record, data.user.timezone);
		if (record.ownerId !== data.user.id) {
			return { ...event, title: `${record.ownerName} · ${event.title}`, editable: false };
		}
		return pendingMove?.records === data.records && pendingMove.event.id === event.id
			? pendingMove.event
			: event;
	})
);
```

Guard the click handler so only own events open the edit dialog:

```ts
function handleEventClick(event: CalendarEvent<EventRecord & { ownerId: string }>) {
	if (event.data && event.data.ownerId === data.user.id) dialog?.openEdit(event.data);
}
```

(Adjust the generic type annotations to whatever `pnpm check` requires — the record now carries `ownerId`/`ownerName`; a local `type Record = (typeof data.records)[number]` alias is cleaner than widening `EventRecord`.)

Add the toggle group to the header snippet and include `filter` in `actionParams` and the `$effect` URL:

```svelte
{#snippet headerActions()}
	<ToggleGroup.Root
		type="single"
		value={filter}
		onValueChange={(value) => {
			if (value) filter = value as typeof filter;
		}}
		variant="outline"
	>
		{#each Object.entries(filterLabels) as [key, label] (key)}
			<ToggleGroup.Item value={key} aria-label={label}>{label}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
	<Button onclick={() => dialog?.openCreate()}>{m.calendar_event_add()}</Button>
{/snippet}
```

```ts
const actionParams = $derived(`&view=${view}&date=${date.toString()}&filter=${filter}`);

$effect(() => {
	const params = new URLSearchParams({ view, date: date.toString(), filter });
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	goto(`?${params}`, { replaceState: true, keepFocus: true, noScroll: true });
});
```

Run through `svelte-autofixer` until clean.

- [ ] **Step 3: Verify in the browser (two users, real dev Postgres)**

`pnpm check && pnpm lint && pnpm test`, then:
1. User A and B share a team → A sees B's events (name-prefixed, not draggable, click does nothing), B sees A's.
2. Filter toggles: Mine hides B's events; Teams shows only B's; Shared shows only share-sourced calendars; All shows everything.
3. A creates an event → B gets an in-app notification (bell badge) + logged email; A drags an event → same as "updated".
4. B hides A's direct share → A's events disappear for B (team-sourced events stay).
Remember (memory note): reload the preview frame after edits, and verify against dev Postgres rather than in-page fetch spies. The `pendingMove` identity check relies on `$state.raw` — don't touch it.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/calendar
git commit -m "feat(sharing): calendar visibility union, filter, read-only shared events, change notifications"
```

---

### Task 15: Final verification

**Files:** none new.

- [ ] **Step 1: Full automated pass**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: all clean/passing. Fix anything that isn't before proceeding.

- [ ] **Step 2: End-to-end walkthrough in the browser** (dev server + dev Postgres, two browser sessions)

1. Create team, invite registered user (accept via notification) and unregistered email (sign up → invitation waiting).
2. Teammates see each other's calendars automatically.
3. Personal share to person + to a team you're not in; team share to person + team; share to unregistered email converts on signup (share + notification appear).
4. Share-back from notification and from email CTA path (`/app/notifications`).
5. Revoke (sharer) and hide/unhide (recipient) — visibility updates both times.
6. Event create/edit/drag-move → in-app + email (console-logged) notifications to teammates and share recipients.
7. Role change, ownership transfer, member removal, leave, rename, delete team.
8. Filter toggle: all/mine/teams/shared.

- [ ] **Step 3: Spec coverage check**

Re-read `docs/superpowers/specs/2026-07-02-calendar-sharing-design.md` requirement by requirement and confirm each is implemented. Fix gaps before declaring done.

- [ ] **Step 4: Use the superpowers:verification-before-completion skill, then superpowers:finishing-a-development-branch**
