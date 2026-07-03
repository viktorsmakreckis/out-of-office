# Notification Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose which notification categories reach their personal channels (in-app, email) and let team managers choose, per webhook connection, whether out-of-office updates post to it.

**Architecture:** Add a `notification_preference` table (one row per user, boolean per category×channel) and a `notify_ooo` column on `integration_connection`. A pure `recipientsForChannel` helper splits a resolved audience into per-channel recipient lists at the existing fan-out points in `notifications.ts` / `webhooks.ts`. Absent preference row / default column = everything on, so existing behavior is unchanged until someone opts out. UI is a new switch grid on `/app/settings` and a per-connection switch in the team Integrations card.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Drizzle ORM + Postgres, drizzle-kit migrations, sveltekit-superforms + zod4, shadcn-svelte (`Switch`, `Card`, `Field`), Paraglide i18n, Vitest, pnpm, BullMQ queue (existing).

## Global Constraints

- Package manager is **pnpm**. Run tests with `pnpm test:unit -- --run <path>`; typecheck with `pnpm check`.
- Vitest config sets `expect: { requireAssertions: true }` — every test must contain at least one assertion.
- **No `Co-Authored-By` trailer** in commit messages (repo convention).
- All user-facing strings go through Paraglide `m.*` and must exist in **all four** locale files: `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json`.
- Svelte components must be run through the Svelte MCP `svelte-autofixer` until it reports no issues before being considered done.
- Preference defaults MUST be all-on (absent row / `true` column default) so current delivery behavior is preserved with no backfill.
- Follow `/karpathy-guidelines`: surgical changes, no unrelated refactors, match surrounding style.
- Boolean form fields use the bits-ui `Switch` with `name` + `bind:checked` inside a superForm (proven in `src/routes/app/calendar/event-dialog.svelte:151`); the per-connection auto-submit toggle uses a hidden input + `requestSubmit()` (proven by the `updateLanguage` idiom in `src/lib/components/integrations/integrations-card.svelte:76-106`).

---

### Task 1: Schema — `notification_preference` table + `notify_ooo` column + migration

**Files:**
- Modify: `src/lib/server/db/schema.ts` (append after the `notification` table, ~line 160; add column inside `integration_connection`, ~line 192)
- Create: `drizzle/0010_notification_preferences.sql` (generated)

**Interfaces:**
- Produces: Drizzle table `notificationPreference` with columns `userId, oooInApp, oooEmail, sharedInApp, sharedEmail, updatedAt`; new column `integrationConnection.notifyOoo` (boolean, not null, default true).

- [ ] **Step 1: Add the `notifyOoo` column to `integration_connection`**

In `src/lib/server/db/schema.ts`, inside the `integrationConnection` table definition, add the column right after `label`:

```ts
		label: text('label'),
		notifyOoo: boolean('notify_ooo').notNull().default(true),
```

- [ ] **Step 2: Add the `notification_preference` table**

In `src/lib/server/db/schema.ts`, immediately after the `notification` table definition (after its closing `);` near line 160), add:

```ts
/**
 * Per-user notification channel preferences. One row per user, created lazily on
 * first save; an absent row is read as all-on (see notification-preferences.ts),
 * so existing users keep receiving everything until they opt out.
 */
export const notificationPreference = pgTable('notification_preference', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	oooInApp: boolean('ooo_in_app').notNull().default(true),
	oooEmail: boolean('ooo_email').notNull().default(true),
	sharedInApp: boolean('shared_in_app').notNull().default(true),
	sharedEmail: boolean('shared_email').notNull().default(true),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});
```

`boolean`, `text`, `timestamp`, and `pgTable` are already imported at the top of the file; `user` is already imported from `./auth.schema`. No new imports needed.

- [ ] **Step 3: Typecheck the schema**

Run: `pnpm check`
Expected: PASS (no type errors). If `boolean` is somehow unused elsewhere it is still imported already — no change expected.

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate`
Expected: creates `drizzle/0010_notification_preferences.sql` containing `CREATE TABLE "notification_preference"` and `ALTER TABLE "integration_connection" ADD COLUMN "notify_ooo" boolean DEFAULT true NOT NULL`. Verify the file was created and its contents match that shape.

- [ ] **Step 5: Apply the migration to the dev DB**

Ensure Postgres is running (`pnpm db:start` in another terminal if needed), then run: `pnpm db:migrate`
Expected: applies cleanly, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle/0010_notification_preferences.sql drizzle/meta
git commit -m "feat(db): notification_preference table and connection notify_ooo column"
```

---

### Task 2: Preference resolver + pure channel-split helper (TDD)

**Files:**
- Create: `src/lib/server/notification-preferences.ts`
- Create: `src/lib/server/notification-preferences.spec.ts`

**Interfaces:**
- Consumes: `notificationPreference` table (Task 1); `db` from `$lib/server/db`.
- Produces:
  - `type ChannelPrefs = { oooInApp: boolean; oooEmail: boolean; sharedInApp: boolean; sharedEmail: boolean }`
  - `const DEFAULT_CHANNEL_PREFS: ChannelPrefs` (all `true`)
  - `recipientsForChannel<T extends { id: string }>(recipients: T[], prefs: Map<string, ChannelPrefs>, channel: keyof ChannelPrefs): T[]`
  - `getUserChannelPrefs(userIds: string[]): Promise<Map<string, ChannelPrefs>>`
  - `getChannelPrefs(userId: string): Promise<ChannelPrefs>`
  - `upsertChannelPrefs(userId: string, prefs: ChannelPrefs): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/notification-preferences.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CHANNEL_PREFS,
	recipientsForChannel,
	type ChannelPrefs
} from './notification-preferences';

const R = (id: string) => ({ id, email: `${id}@x.test` });
const prefs = (overrides: Partial<ChannelPrefs>): ChannelPrefs => ({
	...DEFAULT_CHANNEL_PREFS,
	...overrides
});

describe('recipientsForChannel', () => {
	it('includes a recipient with no prefs row (defaults all-on)', () => {
		const result = recipientsForChannel([R('a')], new Map(), 'oooEmail');
		expect(result.map((r) => r.id)).toEqual(['a']);
	});

	it('excludes a recipient who disabled that one channel', () => {
		const map = new Map([['a', prefs({ oooEmail: false })]]);
		expect(recipientsForChannel([R('a')], map, 'oooEmail')).toEqual([]);
	});

	it('keeps other channels of the same recipient unaffected', () => {
		const map = new Map([['a', prefs({ oooEmail: false })]]);
		expect(recipientsForChannel([R('a')], map, 'oooInApp').map((r) => r.id)).toEqual(['a']);
	});

	it('treats categories independently', () => {
		const map = new Map([['a', prefs({ sharedInApp: false })]]);
		expect(recipientsForChannel([R('a')], map, 'oooInApp').map((r) => r.id)).toEqual(['a']);
		expect(recipientsForChannel([R('a')], map, 'sharedInApp')).toEqual([]);
	});

	it('filters a mixed list on the requested channel', () => {
		const map = new Map([
			['a', prefs({ oooEmail: false })],
			['b', prefs({})]
		]);
		expect(recipientsForChannel([R('a'), R('b')], map, 'oooEmail').map((r) => r.id)).toEqual(['b']);
	});

	it('returns an empty array for no recipients', () => {
		expect(recipientsForChannel([], new Map(), 'oooInApp')).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/server/notification-preferences.spec.ts`
Expected: FAIL — cannot resolve `./notification-preferences` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/server/notification-preferences.ts`:

```ts
import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notificationPreference } from '$lib/server/db/schema';

export type ChannelPrefs = {
	oooInApp: boolean;
	oooEmail: boolean;
	sharedInApp: boolean;
	sharedEmail: boolean;
};

export const DEFAULT_CHANNEL_PREFS: ChannelPrefs = {
	oooInApp: true,
	oooEmail: true,
	sharedInApp: true,
	sharedEmail: true
};

/** Recipients whose preference for `channel` is on; a missing prefs entry defaults on. */
export function recipientsForChannel<T extends { id: string }>(
	recipients: T[],
	prefs: Map<string, ChannelPrefs>,
	channel: keyof ChannelPrefs
): T[] {
	return recipients.filter((recipient) => (prefs.get(recipient.id) ?? DEFAULT_CHANNEL_PREFS)[channel]);
}

/** id → prefs for the given users. Users with no stored row are simply absent from the map. */
export async function getUserChannelPrefs(userIds: string[]): Promise<Map<string, ChannelPrefs>> {
	if (userIds.length === 0) return new Map();
	const rows = await db
		.select({
			userId: notificationPreference.userId,
			oooInApp: notificationPreference.oooInApp,
			oooEmail: notificationPreference.oooEmail,
			sharedInApp: notificationPreference.sharedInApp,
			sharedEmail: notificationPreference.sharedEmail
		})
		.from(notificationPreference)
		.where(inArray(notificationPreference.userId, userIds));
	return new Map(rows.map(({ userId, ...prefs }) => [userId, prefs]));
}

/** One user's prefs, defaulting to all-on when no row exists (for the settings form). */
export async function getChannelPrefs(userId: string): Promise<ChannelPrefs> {
	return (await getUserChannelPrefs([userId])).get(userId) ?? DEFAULT_CHANNEL_PREFS;
}

/** Upserts the user's prefs row. */
export async function upsertChannelPrefs(userId: string, prefs: ChannelPrefs): Promise<void> {
	await db
		.insert(notificationPreference)
		.values({ userId, ...prefs })
		.onConflictDoUpdate({ target: notificationPreference.userId, set: prefs });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/server/notification-preferences.spec.ts`
Expected: PASS (6 passing).

- [ ] **Step 5: Typecheck**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/notification-preferences.ts src/lib/server/notification-preferences.spec.ts
git commit -m "feat: channel preference resolver and pure split helper"
```

---

### Task 3: Enforce preferences in the delivery pipeline

**Files:**
- Modify: `src/lib/server/notifications.ts` (`notifyRecipients`, `notifyShareCreated`, `notifyEventChange`)
- Modify: `src/lib/server/integrations/webhooks.ts` (`postEventToTeamChannels` WHERE clause)

**Interfaces:**
- Consumes: `getUserChannelPrefs`, `recipientsForChannel` (Task 2); `notifyOoo` column (Task 1).
- Produces: no new exported symbols; behavior change only.

- [ ] **Step 1: Filter team webhooks by `notify_ooo`**

In `src/lib/server/integrations/webhooks.ts`, in `postEventToTeamChannels`, add the `notifyOoo` condition to the connections query `where(and(...))` (around line 107-114):

```ts
			.where(
				and(
					inArray(
						integrationConnection.orgId,
						memberships.map((row) => row.organizationId)
					),
					eq(integrationConnection.kind, 'webhook'),
					eq(integrationConnection.notifyOoo, true)
				)
			);
```

`and`, `eq`, `inArray` are already imported.

- [ ] **Step 2: Split `notifyRecipients` into in-app vs email lists**

In `src/lib/server/notifications.ts`, change the `notifyRecipients` helper (lines 29-46) to take separate lists:

```ts
/** Inserts in-app rows for `inAppRecipients` and emails `emailRecipients`; email failures are logged, never thrown. */
async function notifyRecipients(
	inAppRecipients: Recipient[],
	emailRecipients: Recipient[],
	type: NotificationType,
	actorName: string,
	data: NotificationData,
	emailFor: (recipient: Recipient) => EmailContent
): Promise<void> {
	if (inAppRecipients.length > 0) {
		await db
			.insert(notification)
			.values(inAppRecipients.map((recipient) => ({ userId: recipient.id, type, actorName, data })));
	}
	const results = await Promise.allSettled(
		emailRecipients.map((recipient) => sendEmail(recipient.email, emailFor(recipient)))
	);
	for (const result of results) {
		if (result.status === 'rejected') console.error('[notifications] email failed:', result.reason);
	}
}
```

- [ ] **Step 3: Apply share prefs in `notifyShareCreated`**

In `src/lib/server/notifications.ts`, in `notifyShareCreated` (the non-email branch, lines 87-90), replace:

```ts
	const recipients = await resolveTargetRecipients(target);
	await notifyRecipients(recipients, 'calendar_shared', sharerName, { shareId }, (recipient) =>
		calendarSharedEmail(sharerName, notificationsUrl(), recipientLocale(recipient))
	);
```

with:

```ts
	const recipients = await resolveTargetRecipients(target);
	const prefs = await getUserChannelPrefs(recipients.map((recipient) => recipient.id));
	await notifyRecipients(
		recipientsForChannel(recipients, prefs, 'sharedInApp'),
		recipientsForChannel(recipients, prefs, 'sharedEmail'),
		'calendar_shared',
		sharerName,
		{ shareId },
		(recipient) => calendarSharedEmail(sharerName, notificationsUrl(), recipientLocale(recipient))
	);
```

- [ ] **Step 4: Apply OOO prefs in `notifyEventChange`**

In `src/lib/server/notifications.ts`, in `notifyEventChange` (lines 116-138), replace the body from `const recipients = ...` through the `enqueueEventDelivery` call with:

```ts
	const recipients = await getEventAudience(actor.id);
	const prefs = await getUserChannelPrefs(recipients.map((recipient) => recipient.id));
	const inAppRecipients = recipientsForChannel(recipients, prefs, 'oooInApp');
	const emailRecipients = recipientsForChannel(recipients, prefs, 'oooEmail');
	if (inAppRecipients.length > 0) {
		await db.insert(notification).values(
			inAppRecipients.map((recipient) => ({
				userId: recipient.id,
				type: eventNotificationType(kind),
				actorName: actor.name,
				data: { eventTitle, eventType } satisfies EventChangeData
			}))
		);
	}
	await enqueueEventDelivery({
		actorId: actor.id,
		actorName: actor.name,
		kind,
		title: eventTitle,
		type: eventType,
		range,
		emailRecipients: emailRecipients.map((recipient) => ({
			email: recipient.email,
			locale: recipient.locale
		}))
	});
```

- [ ] **Step 5: Add the import**

At the top of `src/lib/server/notifications.ts`, add after the existing `$lib/server` imports:

```ts
import { getUserChannelPrefs, recipientsForChannel } from '$lib/server/notification-preferences';
```

- [ ] **Step 6: Typecheck and run the existing notification tests**

Run: `pnpm check`
Expected: PASS.

Run: `pnpm test:unit -- --run src/lib/server/notifications.spec.ts`
Expected: PASS — the existing `deliverEventChange` / `eventNotificationType` tests still pass (this task does not change `deliverEventChange`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/notifications.ts src/lib/server/integrations/webhooks.ts
git commit -m "feat: apply channel preferences when fanning out notifications"
```

---

### Task 4: User settings — Notifications switch grid

**Files:**
- Create: `src/lib/schemas/notification.ts`
- Modify: `src/routes/app/settings/+page.server.ts` (load + new `notifications` action)
- Modify: `src/routes/app/settings/+page.svelte` (new card)
- Modify: `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `getChannelPrefs`, `upsertChannelPrefs`, `type ChannelPrefs` (Task 2).
- Produces: `notificationPreferencesSchema` (zod object of 4 booleans); a `notifications` form action; page data field `notificationsForm`.

- [ ] **Step 1: Add the zod schema**

Create `src/lib/schemas/notification.ts`:

```ts
import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
	oooInApp: z.boolean(),
	oooEmail: z.boolean(),
	sharedInApp: z.boolean(),
	sharedEmail: z.boolean()
});
```

- [ ] **Step 2: Add the i18n messages**

Add these keys to each locale file. **en-GB.json** and **en-US.json** (identical English):

```json
	"settings_notifications_title": "Notifications",
	"settings_notifications_description": "Choose which updates reach you and where.",
	"settings_notifications_channel_in_app": "In-app",
	"settings_notifications_channel_email": "Email",
	"settings_notifications_ooo_label": "Out-of-office updates",
	"settings_notifications_shared_label": "Calendar shared with me",
	"settings_notifications_saved": "Notification preferences saved.",
```

**pl.json**:

```json
	"settings_notifications_title": "Powiadomienia",
	"settings_notifications_description": "Wybierz, które aktualizacje do Ciebie docierają i gdzie.",
	"settings_notifications_channel_in_app": "W aplikacji",
	"settings_notifications_channel_email": "E-mail",
	"settings_notifications_ooo_label": "Aktualizacje nieobecności",
	"settings_notifications_shared_label": "Udostępniony mi kalendarz",
	"settings_notifications_saved": "Zapisano preferencje powiadomień.",
```

**fr.json**:

```json
	"settings_notifications_title": "Notifications",
	"settings_notifications_description": "Choisissez quelles mises à jour vous parviennent et où.",
	"settings_notifications_channel_in_app": "Dans l'application",
	"settings_notifications_channel_email": "E-mail",
	"settings_notifications_ooo_label": "Mises à jour d'absence",
	"settings_notifications_shared_label": "Calendrier partagé avec moi",
	"settings_notifications_saved": "Préférences de notification enregistrées.",
```

Insert each block next to the other `settings_*` keys, keeping valid JSON (watch trailing commas — do not add a comma after the file's last key).

- [ ] **Step 3: Wire the load function**

In `src/routes/app/settings/+page.server.ts`:

Add imports near the other `$lib/schemas` / `$lib/server` imports:

```ts
import { notificationPreferencesSchema } from '$lib/schemas/notification';
import { getChannelPrefs, upsertChannelPrefs } from '$lib/server/notification-preferences';
```

In `load`, extend the `Promise.all` array with a fifth `superValidate` and read the prefs. Change the destructuring and the array:

```ts
	const channelPrefs = await getChannelPrefs(user.id);
	const [profileForm, emailForm, passwordForm, deleteForm, notificationsForm] = await Promise.all([
		superValidate(
			{
				name: user.name,
				locale: isLocale(user.locale) ? user.locale : baseLocale,
				timezone: user.timezone
			},
			zod4(profileSchema),
			{ id: 'profile', errors: false }
		),
		superValidate(zod4(changeEmailSchema), { id: 'changeEmail' }),
		superValidate(zod4(changePasswordSchema), { id: 'changePassword' }),
		superValidate(zod4(deleteAccountSchema), { id: 'deleteAccount' }),
		superValidate(channelPrefs, zod4(notificationPreferencesSchema), {
			id: 'notifications',
			errors: false
		})
	]);
	return {
		profileForm,
		emailForm,
		passwordForm,
		deleteForm,
		notificationsForm,
		feedUrl: feedUrl(await getOrCreateFeedToken({ type: 'user', id: user.id }))
	};
```

- [ ] **Step 4: Add the `notifications` action**

In `src/routes/app/settings/+page.server.ts`, add this action to the `actions` object (e.g. after `changePassword`):

```ts
	notifications: async (event) => {
		const form = await superValidate(event.request, zod4(notificationPreferencesSchema), {
			id: 'notifications'
		});
		if (!form.valid) return fail(400, { form });

		const user = event.locals.user;
		if (!user) throw kitRedirect(303, '/login');
		await upsertChannelPrefs(user.id, form.data);

		redirect(
			303,
			'/app/settings',
			{ type: 'success', message: m.settings_notifications_saved() },
			event
		);
	},
```

- [ ] **Step 5: Add the Notifications card to the page**

In `src/routes/app/settings/+page.svelte`:

Add imports in the `<script>` block:

```ts
	import { Switch } from '$lib/components/ui/switch';
	import { notificationPreferencesSchema } from '$lib/schemas/notification';
```

Add a superForm instance alongside the others (after the `passwordForm` block):

```ts
	// svelte-ignore state_referenced_locally
	const {
		form: notificationsForm,
		submitting: notificationsSubmitting,
		enhance: notificationsEnhance
	} = superForm(data.notificationsForm, { validators: zod4Client(notificationPreferencesSchema) });
```

Add the card markup after the Password card and before the Feed card:

```svelte
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_notifications_title()}</Card.Title>
			<Card.Description>{m.settings_notifications_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/notifications" use:notificationsEnhance>
				<Field.Group>
					<div class="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-4">
						<span></span>
						<span class="text-sm text-muted-foreground">
							{m.settings_notifications_channel_in_app()}
						</span>
						<span class="text-sm text-muted-foreground">
							{m.settings_notifications_channel_email()}
						</span>

						<Label for="pref-ooo-in-app">{m.settings_notifications_ooo_label()}</Label>
						<Switch id="pref-ooo-in-app" name="oooInApp" bind:checked={$notificationsForm.oooInApp} />
						<Switch name="oooEmail" bind:checked={$notificationsForm.oooEmail} />

						<Label for="pref-shared-in-app">{m.settings_notifications_shared_label()}</Label>
						<Switch
							id="pref-shared-in-app"
							name="sharedInApp"
							bind:checked={$notificationsForm.sharedInApp}
						/>
						<Switch name="sharedEmail" bind:checked={$notificationsForm.sharedEmail} />
					</div>
					<div>
						<Button type="submit" disabled={$notificationsSubmitting}>
							{#if $notificationsSubmitting}<Spinner />{/if}
							{m.save()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
```

`Card`, `Field`, `Button`, `Spinner`, and `Label` are already imported in this file. Add `Label` only if not already imported — check the existing import list first; if `Label` is missing, add `import { Label } from '$lib/components/ui/label';`.

- [ ] **Step 6: Run the Svelte autofixer on the page**

Use the Svelte MCP `svelte-autofixer` on `src/routes/app/settings/+page.svelte`. Apply its suggestions and re-run until it reports no issues.

- [ ] **Step 7: Typecheck**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 8: Verify in the browser (dev DB)**

Start the dev server (`preview_start`), sign in as the dev test account, open `/app/settings`. Confirm the Notifications card renders with four switches defaulting to on. Toggle "Email" off for out-of-office updates, Save, reload — the switch stays off. Confirm via dev Postgres that a `notification_preference` row exists with `ooo_email = false` and the other columns `true`. Re-enable and Save to confirm the upsert path.

- [ ] **Step 9: Commit**

```bash
git add src/lib/schemas/notification.ts src/routes/app/settings messages
git commit -m "feat: user notification preferences on settings page"
```

---

### Task 5: Team settings — per-connection out-of-office toggle

**Files:**
- Modify: `src/lib/schemas/integration.ts` (add `updateConnectionNotifySchema`)
- Modify: `src/routes/app/teams/[id]/+page.server.ts` (select `notifyOoo`; add `updateConnectionNotify` action)
- Modify: `src/lib/components/integrations/integrations-card.svelte` (`notifyOoo` in `ConnectionRow`; per-connection switch)
- Modify: `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `notifyOoo` column (Task 1).
- Produces: `updateConnectionNotifySchema` ({ id: string; notifyOoo: boolean } after transform); a `updateConnectionNotify` form action; `notifyOoo` on each connection row passed to the card.

- [ ] **Step 1: Add the zod schema**

In `src/lib/schemas/integration.ts`, append:

```ts
export const updateConnectionNotifySchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() }),
	notifyOoo: z.enum(['true', 'false']).transform((value) => value === 'true')
});
```

`z` and `m` are already imported in this file.

- [ ] **Step 2: Add the i18n messages**

Add to each locale file, next to the other `integrations_*` keys.

**en-GB.json** and **en-US.json**:

```json
	"integrations_notify_ooo_label": "Out-of-office updates",
	"integrations_prefs_saved": "Channel preferences saved.",
```

**pl.json**:

```json
	"integrations_notify_ooo_label": "Aktualizacje nieobecności",
	"integrations_prefs_saved": "Zapisano preferencje kanału.",
```

**fr.json**:

```json
	"integrations_notify_ooo_label": "Mises à jour d'absence",
	"integrations_prefs_saved": "Préférences du canal enregistrées.",
```

Keep the JSON valid (no trailing comma after the last key of the file).

- [ ] **Step 3: Select `notifyOoo` in the team load**

In `src/routes/app/teams/[id]/+page.server.ts`, in `load`, add `notifyOoo` to the connections `select` (the object around lines 130-136):

```ts
				.select({
					id: integrationConnection.id,
					provider: integrationConnection.provider,
					label: integrationConnection.label,
					notifyOoo: integrationConnection.notifyOoo,
					consecutiveFailures: integrationConnection.consecutiveFailures,
					lastFailureAt: integrationConnection.lastFailureAt
				})
```

- [ ] **Step 4: Add the `updateConnectionNotify` action**

In `src/routes/app/teams/[id]/+page.server.ts`:

Add `updateConnectionNotifySchema` to the existing import from `$lib/schemas/integration`:

```ts
import {
	addConnectionSchema,
	connectionIdSchema,
	updateConnectionNotifySchema
} from '$lib/schemas/integration';
```

Add this action to the `actions` object (e.g. after `removeConnection`):

```ts
	updateConnectionNotify: async (event) => {
		const form = await superValidate(event.request, zod4(updateConnectionNotifySchema), {
			id: 'connection-notify'
		});
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		const updated = await db
			.update(integrationConnection)
			.set({ notifyOoo: form.data.notifyOoo })
			.where(
				and(
					eq(integrationConnection.id, form.data.id),
					eq(integrationConnection.orgId, event.params.id)
				)
			)
			.returning({ id: integrationConnection.id });
		if (updated.length === 0) error(404);
		flash(event, { type: 'success', message: m.integrations_prefs_saved() });
		return { form };
	},
```

`and`, `eq`, `error`, `fail`, `superValidate`, `zod4`, `db`, `integrationConnection`, `requireUser`, `requireMembership`, `requireManager`, and `flash` are all already imported/defined in this file.

- [ ] **Step 5: Add `notifyOoo` to the card's `ConnectionRow` type and render the switch**

In `src/lib/components/integrations/integrations-card.svelte`:

Add `Switch` and `Label` imports:

```ts
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
```

Extend the `ConnectionRow` type with `notifyOoo: boolean;`:

```ts
	type ConnectionRow = {
		id: string;
		provider: Provider;
		label: string | null;
		notifyOoo: boolean;
		consecutiveFailures: number;
		lastFailureAt: Date | null;
	};
```

In the connection list, add a toggle form inside each connection's `Item.Actions`, before the test-connection form. Give the form a unique id so the change handler can find it (mirrors the `updateLanguage` idiom already in this file):

```svelte
							<Item.Actions>
								<form
									id="notify-form-{row.id}"
									method="POST"
									action="?/updateConnectionNotify"
									use:enhance
									class="flex items-center gap-2"
								>
									<input type="hidden" name="id" value={row.id} />
									<input type="hidden" name="notifyOoo" value={String(row.notifyOoo)} />
									<Label for="notify-{row.id}" class="text-sm text-muted-foreground">
										{m.integrations_notify_ooo_label()}
									</Label>
									<Switch
										id="notify-{row.id}"
										checked={row.notifyOoo}
										onCheckedChange={(value) => {
											const notifyForm = document.getElementById(`notify-form-${row.id}`);
											if (!(notifyForm instanceof HTMLFormElement)) return;
											const input = notifyForm.querySelector('input[name="notifyOoo"]');
											if (input instanceof HTMLInputElement) {
												input.value = String(value);
												notifyForm.requestSubmit();
											}
										}}
									/>
								</form>
								<form method="POST" action="?/testConnection" use:enhance>
```

Leave the rest of `Item.Actions` (test + remove forms) unchanged. `enhance` (from `$app/forms`) and `Item` are already imported.

- [ ] **Step 6: Run the Svelte autofixer on the card**

Use the Svelte MCP `svelte-autofixer` on `src/lib/components/integrations/integrations-card.svelte`. Apply suggestions and re-run until clean.

- [ ] **Step 7: Typecheck**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 8: Verify in the browser (dev DB)**

As a team owner/admin, open a team page with at least one webhook connection. Confirm each connection shows an "Out-of-office updates" switch reflecting `notify_ooo` (on by default). Toggle it off — a success flash appears and the switch stays off after the enhanced reload. Confirm via dev Postgres that the connection's `notify_ooo` is now `false`. Toggle back on. (Optional end-to-end: with the switch off, create a calendar event and confirm no post is attempted to that connection.)

- [ ] **Step 9: Full test + lint sweep**

Run: `pnpm test`
Expected: PASS (all suites).

Run: `pnpm lint`
Expected: PASS (prettier + eslint clean). Run `pnpm format` first if prettier reports formatting.

- [ ] **Step 10: Commit**

```bash
git add src/lib/schemas/integration.ts src/routes/app/teams/[id] src/lib/components/integrations/integrations-card.svelte messages
git commit -m "feat: per-connection out-of-office toggle for team channels"
```

---

## Self-Review

**Spec coverage:**
- User in-app/email toggles for OOO + Calendar-shared → Tasks 1, 2, 4 (schema, resolver, UI).
- Per-connection team webhook toggle → Tasks 1, 3, 5 (column, WHERE filter, UI).
- Team invitations always-on/transactional → honored by omission: no task touches the invitation email path; `team_invite` has no preference column.
- Defaults preserve current behavior → Task 1 column defaults `true`; Task 2 `DEFAULT_CHANNEL_PREFS` all-on and "absent row = on"; verified in Tasks 4/8 and 5/8.
- Enforcement at fan-out (`notifyEventChange`, `postEventToTeamChannels`, `notifyShareCreated`) → Task 3.
- i18n across four locales → Tasks 4/2 and 5/2.
- TDD of the pure split logic → Task 2.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. Translations are provided verbatim for all four locales.

**Type consistency:** `ChannelPrefs` keys (`oooInApp`, `oooEmail`, `sharedInApp`, `sharedEmail`) are used identically in Tasks 2, 3, 4. `recipientsForChannel` / `getUserChannelPrefs` / `getChannelPrefs` / `upsertChannelPrefs` signatures match between definition (Task 2) and use (Tasks 3, 4). `notifyOoo` column name (`notify_ooo`) is consistent across schema (Task 1), WHERE filter (Task 3), action + select + card (Task 5). `updateConnectionNotifySchema` transforms `'true'|'false'` → boolean, matching the hidden-input encoding in the card.
