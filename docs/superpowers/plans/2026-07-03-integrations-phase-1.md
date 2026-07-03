# Integrations Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team-scoped webhook connections that post out-of-office events to Slack/Discord/Teams channels, plus secret-URL iCal feeds for users and teams.

**Architecture:** Two new tables (`integration_connection`, `calendar_feed_token`) following the existing XOR-owner pattern from `calendar_share`. A new `src/lib/server/integrations/` module holds pure formatters (per-provider webhook payloads, iCal generation) and a thin delivery layer hooked into the existing `notifyEventChange` fan-out. UI lives on the team page (connections + team feed) and personal settings (user feed), built with superforms actions like every other page.

**Tech Stack:** SvelteKit 2 + Svelte 5, Drizzle/Postgres, sveltekit-superforms + zod 4, paraglide i18n, shadcn-svelte components, vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-integrations-phase-1-design.md`

## Global Constraints

- Package manager is **pnpm**. Never npm/npx.
- **Never add a `Co-Authored-By` trailer to commits.**
- All user-facing copy goes through paraglide: add keys to `messages/en.json`, `messages/fr.json`, and `messages/pl.json` (all three, every time). Use via `import { m } from '$lib/paraglide/messages.js'`.
- Use shadcn-svelte components from `src/lib/components/ui` (Card, Item, Field, Input, Select, Button, Badge, Spinner already installed) — no hand-rolled equivalents.
- Any `.svelte` code must be run through the Svelte MCP `svelte-autofixer` tool until it reports no issues, before committing (CLAUDE.md requirement).
- Before each commit: `pnpm format` (prettier writes), and the committed state must pass `pnpm lint` and `pnpm check`.
- Vitest specs are colocated: `foo.ts` → `foo.spec.ts`. Run one file with `pnpm test:unit -- --run <path>`; run all with `pnpm test`.
- Migrations: edit `src/lib/server/db/schema.ts`, then `pnpm db:generate --name <name>` (creates `drizzle/000N_<name>.sql`). Dev DB runs via `pnpm db:start` (docker) and `pnpm db:migrate`.
- Channel messages are intentionally **base-locale (English)** — a channel has no single user locale. Always call paraglide with `{ locale: baseLocale }` for channel copy.
- Timestamps in `calendar_event`: all-day rows store UTC midnight and are **end-inclusive by date part**; timed rows are end-exclusive instants. (See `src/lib/server/db/schema.ts` doc comment.)

---

### Task 1: Database schema + migration

**Files:**
- Modify: `src/lib/server/db/schema.ts` (append after the `notification` table)
- Create: `drizzle/0007_integrations.sql` (generated)

**Interfaces:**
- Produces: exported Drizzle tables `integrationConnection`, `calendarFeedToken`; enums `integrationProviderEnum` (`'slack' | 'discord' | 'msteams'`), `integrationKindEnum` (`'webhook'`); exported type `IntegrationProvider`. Column names used later: `integrationConnection.{id, orgId, userId, provider, kind, webhookUrl, label, createdById, consecutiveFailures, lastFailureAt, createdAt}`, `calendarFeedToken.{token, userId, orgId, createdAt}`.

- [ ] **Step 1: Add the tables to the schema**

Append to `src/lib/server/db/schema.ts`:

```ts
export const integrationProviderEnum = pgEnum('integration_provider', [
	'slack',
	'discord',
	'msteams'
]);
export type IntegrationProvider = (typeof integrationProviderEnum.enumValues)[number];

/** Phase 1 only has webhooks; Phase 2 adds 'oauth'. */
export const integrationKindEnum = pgEnum('integration_kind', ['webhook']);

/**
 * A webhook connection owned by a team (org) or, from Phase 2, a user — XOR,
 * same pattern as calendar_share. Failure counters let the UI surface dead
 * webhooks; see docs/superpowers/specs/2026-07-03-integrations-phase-1-design.md.
 */
export const integrationConnection = pgTable(
	'integration_connection',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		provider: integrationProviderEnum('provider').notNull(),
		kind: integrationKindEnum('kind').notNull().default('webhook'),
		webhookUrl: text('webhook_url').notNull(),
		label: text('label'),
		createdById: text('created_by_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		consecutiveFailures: integer('consecutive_failures').notNull().default(0),
		lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'integration_connection_owner_xor',
			sql`num_nonnulls(${table.orgId}, ${table.userId}) = 1`
		),
		index('integration_connection_org_idx').on(table.orgId),
		index('integration_connection_user_idx').on(table.userId)
	]
);

/** Capability token for a read-only iCal feed; one per user or per org. */
export const calendarFeedToken = pgTable(
	'calendar_feed_token',
	{
		token: text('token')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'calendar_feed_token_owner_xor',
			sql`num_nonnulls(${table.userId}, ${table.orgId}) = 1`
		),
		unique('calendar_feed_token_owner_unique').on(table.userId, table.orgId).nullsNotDistinct()
	]
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate --name integrations`
Expected: creates `drizzle/0007_integrations.sql` containing `CREATE TYPE "public"."integration_provider"`, both `CREATE TABLE` statements, the two CHECK constraints, and the unique constraint with `NULLS NOT DISTINCT`. Read the SQL and confirm.

- [ ] **Step 3: Apply to the dev database**

Run: `pnpm db:migrate` (start `pnpm db:start` in the background first if postgres isn't running)
Expected: exits 0.

- [ ] **Step 4: Verify types compile**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle/
git commit -m "feat(db): add integration_connection and calendar_feed_token tables"
```

---

### Task 2: Shared event-type labels + neutral channel message

**Files:**
- Create: `src/lib/events/labels.ts`
- Create: `src/lib/server/integrations/message.ts`
- Test: `src/lib/server/integrations/message.spec.ts`
- Modify: `src/lib/server/notifications.ts` (replace local `eventTypeLabelFor` with the shared one)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/pl.json`

**Interfaces:**
- Produces:
  - `eventTypeLabelFor(type: string, locale: Locale): string` in `$lib/events/labels`
  - In `$lib/server/integrations/message`:
    - `type OooMessage = { actorName: string; eventLabel: string; emoji: string; dateRange: string; kind: 'created' | 'updated' | 'test' }`
    - `buildEventMessage(actorName: string, kind: 'created' | 'updated', title: string | null, type: string, range: { allDay: boolean; start: Date; end: Date }): OooMessage`
    - `testMessage(): OooMessage`
    - `composeLine(message: OooMessage, bold: (s: string) => string): string`
    - `formatDateRange(start: Date, end: Date, allDay: boolean): string`

- [ ] **Step 1: Move the event-type label helper to a shared module**

Create `src/lib/events/labels.ts` (moved verbatim from `notifications.ts` so both email and channel paths share it):

```ts
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime';

/** Localized display label for a calendar_event type. */
export function eventTypeLabelFor(type: string, locale: Locale): string {
	switch (type) {
		case 'vacation':
			return m.calendar_event_type_vacation({}, { locale });
		case 'sick_leave':
			return m.calendar_event_type_sick_leave({}, { locale });
		case 'business_trip':
			return m.calendar_event_type_business_trip({}, { locale });
		case 'public_holiday':
			return m.calendar_event_type_public_holiday({}, { locale });
		case 'remote_work':
			return m.calendar_event_type_remote_work({}, { locale });
		default:
			return m.calendar_event_type_other({}, { locale });
	}
}
```

(If `Locale` is not an exported type name in `$lib/paraglide/runtime`, check the generated runtime file for the exported locale type — the existing `isLocale` import in `notifications.ts` shows the module path is right.)

In `src/lib/server/notifications.ts`: delete the local `eventTypeLabelFor` function (lines ~88–103) and add `import { eventTypeLabelFor } from '$lib/events/labels';`. The call site in `notifyEventChange` stays unchanged.

- [ ] **Step 2: Add channel-copy message keys**

Add to `messages/en.json`:

```json
"channel_message_created": "{emoji} {name} is out {range} ({label})",
"channel_message_updated": "{emoji} {name} updated their time off: {range} ({label})",
"channel_message_test": "👋 Test message from Out of Office — this channel is connected."
```

Add to `messages/fr.json`:

```json
"channel_message_created": "{emoji} {name} est absent(e) {range} ({label})",
"channel_message_updated": "{emoji} {name} a modifié son absence : {range} ({label})",
"channel_message_test": "👋 Message de test d'Out of Office — ce canal est connecté."
```

Add to `messages/pl.json`:

```json
"channel_message_created": "{emoji} {name} jest nieobecny(-a) {range} ({label})",
"channel_message_updated": "{emoji} {name} zmienił(a) swoją nieobecność: {range} ({label})",
"channel_message_test": "👋 Wiadomość testowa z Out of Office — ten kanał jest połączony."
```

Run `pnpm prepare` (or `pnpm check`, which runs `svelte-kit sync`) to regenerate paraglide messages.

- [ ] **Step 3: Write the failing test**

Create `src/lib/server/integrations/message.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildEventMessage, composeLine, formatDateRange, testMessage } from './message';

describe('formatDateRange', () => {
	it('formats a single all-day date without a range dash', () => {
		const day = new Date('2026-07-06T00:00:00Z');
		expect(formatDateRange(day, day, true)).toBe('Jul 6');
	});

	it('formats a multi-day all-day range end-inclusively', () => {
		const start = new Date('2026-07-06T00:00:00Z');
		const end = new Date('2026-07-08T00:00:00Z');
		expect(formatDateRange(start, end, true)).toBe('Jul 6 – Jul 8');
	});

	it('formats timed events with UTC times', () => {
		const start = new Date('2026-07-06T09:00:00Z');
		const end = new Date('2026-07-06T17:00:00Z');
		const result = formatDateRange(start, end, false);
		expect(result).toContain('09:00');
		expect(result).toContain('17:00');
		expect(result).toContain('UTC');
	});
});

describe('buildEventMessage', () => {
	const range = {
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z')
	};

	it('uses the event title as the label when present', () => {
		const message = buildEventMessage('Alice', 'created', 'Trip to Paris', 'vacation', range);
		expect(message.eventLabel).toBe('Trip to Paris');
		expect(message.emoji).toBe('🌴');
	});

	it('falls back to the localized type label', () => {
		const message = buildEventMessage('Alice', 'created', null, 'sick_leave', range);
		expect(message.eventLabel).toBe('Sick leave');
		expect(message.emoji).toBe('🤒');
	});
});

describe('composeLine', () => {
	it('wraps the actor name with the provided bold marker', () => {
		const message = buildEventMessage('Alice', 'created', null, 'vacation', {
			allDay: true,
			start: new Date('2026-07-06T00:00:00Z'),
			end: new Date('2026-07-06T00:00:00Z')
		});
		const line = composeLine(message, (s) => `*${s}*`);
		expect(line).toContain('*Alice*');
		expect(line).toContain('Jul 6');
	});

	it('renders the test message copy regardless of other fields', () => {
		const line = composeLine(testMessage(), (s) => `*${s}*`);
		expect(line).toContain('Test message');
	});
});
```

Note: the `'Sick leave'` assertion must match the actual value of `calendar_event_type_sick_leave` in `messages/en.json` — check it and adjust the expected string to the real copy before running.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/server/integrations/message.spec.ts`
Expected: FAIL — cannot resolve `./message`.

- [ ] **Step 5: Implement message.ts**

Create `src/lib/server/integrations/message.ts`:

```ts
import { eventTypeLabelFor } from '$lib/events/labels';
import type { EventType } from '$lib/events/types';
import { m } from '$lib/paraglide/messages.js';
import { baseLocale } from '$lib/paraglide/runtime';

/**
 * Provider-neutral channel message. Channel posts are base-locale English —
 * a channel has no single user locale.
 */
export type OooMessage = {
	actorName: string;
	eventLabel: string;
	emoji: string;
	dateRange: string;
	kind: 'created' | 'updated' | 'test';
};

const eventTypeEmoji: Record<EventType, string> = {
	vacation: '🌴',
	sick_leave: '🤒',
	business_trip: '✈️',
	public_holiday: '🎉',
	remote_work: '🏠',
	other: '📅'
};

const dateFmt = new Intl.DateTimeFormat('en', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});
const timeFmt = new Intl.DateTimeFormat('en', {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'UTC'
});

/** All-day rows are end-inclusive by date part; timed rows are instants shown in UTC. */
export function formatDateRange(start: Date, end: Date, allDay: boolean): string {
	if (allDay) {
		const from = dateFmt.format(start);
		const to = dateFmt.format(end);
		return from === to ? from : `${from} – ${to}`;
	}
	return `${timeFmt.format(start)} – ${timeFmt.format(end)} UTC`;
}

export function buildEventMessage(
	actorName: string,
	kind: 'created' | 'updated',
	title: string | null,
	type: string,
	range: { allDay: boolean; start: Date; end: Date }
): OooMessage {
	return {
		actorName,
		eventLabel: title ?? eventTypeLabelFor(type, baseLocale),
		emoji: eventTypeEmoji[type as EventType] ?? '📅',
		dateRange: formatDateRange(range.start, range.end, range.allDay),
		kind
	};
}

export function testMessage(): OooMessage {
	return { actorName: '', eventLabel: '', emoji: '', dateRange: '', kind: 'test' };
}

/** Renders the one-line channel text; `bold` supplies the provider's bold syntax. */
export function composeLine(message: OooMessage, bold: (s: string) => string): string {
	if (message.kind === 'test') return m.channel_message_test({}, { locale: baseLocale });
	const params = {
		emoji: message.emoji,
		name: bold(message.actorName),
		range: message.dateRange,
		label: message.eventLabel
	};
	return message.kind === 'created'
		? m.channel_message_created(params, { locale: baseLocale })
		: m.channel_message_updated(params, { locale: baseLocale });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:unit -- --run src/lib/server/integrations/message.spec.ts`
Expected: PASS.

Run: `pnpm test` (the refactor touched notifications.ts — the whole suite must stay green)
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/events/labels.ts src/lib/server/integrations/ src/lib/server/notifications.ts messages/
git commit -m "feat(integrations): neutral channel message with shared event-type labels"
```

---

### Task 3: Provider payload formatters

**Files:**
- Create: `src/lib/server/integrations/formatters.ts`
- Test: `src/lib/server/integrations/formatters.spec.ts`

**Interfaces:**
- Consumes: `OooMessage`, `composeLine` from `./message`; `IntegrationProvider` from `$lib/server/db/schema`.
- Produces: `payloadFor(provider: IntegrationProvider, message: OooMessage): unknown` (plus exported `slackPayload`, `discordPayload`, `msteamsPayload` with the same `(message: OooMessage) => unknown` shape).

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/integrations/formatters.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { discordPayload, msteamsPayload, payloadFor, slackPayload } from './formatters';
import { buildEventMessage } from './message';

const message = buildEventMessage('Alice', 'created', null, 'vacation', {
	allDay: true,
	start: new Date('2026-07-06T00:00:00Z'),
	end: new Date('2026-07-08T00:00:00Z')
});

describe('slackPayload', () => {
	it('produces mrkdwn text and a section block', () => {
		const payload = slackPayload(message) as { text: string; blocks: unknown[] };
		expect(payload.text).toContain('*Alice*');
		expect(payload.blocks).toHaveLength(1);
	});
});

describe('discordPayload', () => {
	it('produces an embed with markdown bold', () => {
		const payload = discordPayload(message) as { embeds: { description: string }[] };
		expect(payload.embeds[0].description).toContain('**Alice**');
	});
});

describe('msteamsPayload', () => {
	it('wraps an adaptive card attachment', () => {
		const payload = msteamsPayload(message) as {
			type: string;
			attachments: { contentType: string; content: { body: { text: string }[] } }[];
		};
		expect(payload.type).toBe('message');
		expect(payload.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
		expect(payload.attachments[0].content.body[0].text).toContain('**Alice**');
	});
});

describe('payloadFor', () => {
	it('dispatches by provider', () => {
		expect(payloadFor('slack', message)).toEqual(slackPayload(message));
		expect(payloadFor('discord', message)).toEqual(discordPayload(message));
		expect(payloadFor('msteams', message)).toEqual(msteamsPayload(message));
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/server/integrations/formatters.spec.ts`
Expected: FAIL — cannot resolve `./formatters`.

- [ ] **Step 3: Implement formatters.ts**

```ts
import type { IntegrationProvider } from '$lib/server/db/schema';
import { composeLine, type OooMessage } from './message';

export function slackPayload(message: OooMessage): unknown {
	const text = composeLine(message, (s) => `*${s}*`);
	return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

export function discordPayload(message: OooMessage): unknown {
	return { embeds: [{ description: composeLine(message, (s) => `**${s}**`) }] };
}

/** Power Automate Workflows webhook envelope (classic O365 connectors are retired). */
export function msteamsPayload(message: OooMessage): unknown {
	return {
		type: 'message',
		attachments: [
			{
				contentType: 'application/vnd.microsoft.card.adaptive',
				content: {
					$schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
					type: 'AdaptiveCard',
					version: '1.4',
					body: [
						{ type: 'TextBlock', text: composeLine(message, (s) => `**${s}**`), wrap: true }
					]
				}
			}
		]
	};
}

const formatters: Record<IntegrationProvider, (message: OooMessage) => unknown> = {
	slack: slackPayload,
	discord: discordPayload,
	msteams: msteamsPayload
};

export function payloadFor(provider: IntegrationProvider, message: OooMessage): unknown {
	return formatters[provider](message);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- --run src/lib/server/integrations/formatters.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/integrations/formatters.ts src/lib/server/integrations/formatters.spec.ts
git commit -m "feat(integrations): slack/discord/teams webhook payload formatters"
```

---

### Task 4: Webhook URL validation + delivery

**Files:**
- Create: `src/lib/server/integrations/webhooks.ts`
- Test: `src/lib/server/integrations/webhooks.spec.ts`

**Interfaces:**
- Consumes: `payloadFor` from `./formatters`; `OooMessage` from `./message`; `db`, `integrationConnection`, `member` from `$lib/server/db` / schema.
- Produces:
  - `isAllowedWebhookUrl(provider: IntegrationProvider, raw: string): boolean`
  - `postJson(url: string, payload: unknown, fetchFn?: typeof fetch): Promise<boolean>`
  - `deliverToConnection(connection: { id: string; provider: IntegrationProvider; webhookUrl: string }, message: OooMessage): Promise<boolean>` — posts and records the failure counter.
  - `postEventToTeamChannels(actorId: string, message: OooMessage): Promise<void>` — best-effort, never throws.

- [ ] **Step 1: Write the failing test** (pure parts only: URL validation and `postJson` with an injected fetch — DB-touching functions stay thin and are exercised in browser verification, matching how `sharing.ts` is tested)

Create `src/lib/server/integrations/webhooks.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAllowedWebhookUrl, postJson } from './webhooks';

describe('isAllowedWebhookUrl', () => {
	it('accepts official hosts per provider', () => {
		expect(isAllowedWebhookUrl('slack', 'https://hooks.slack.com/services/T0/B0/x')).toBe(true);
		expect(isAllowedWebhookUrl('discord', 'https://discord.com/api/webhooks/1/x')).toBe(true);
		expect(isAllowedWebhookUrl('discord', 'https://discordapp.com/api/webhooks/1/x')).toBe(true);
		expect(
			isAllowedWebhookUrl('msteams', 'https://prod-01.westeurope.logic.azure.com/workflows/x')
		).toBe(true);
		expect(isAllowedWebhookUrl('msteams', 'https://x.api.powerplatform.com/workflows/y')).toBe(
			true
		);
	});

	it('rejects wrong hosts, cross-provider hosts, and non-https', () => {
		expect(isAllowedWebhookUrl('slack', 'https://evil.example.com/services/x')).toBe(false);
		expect(isAllowedWebhookUrl('slack', 'https://discord.com/api/webhooks/1/x')).toBe(false);
		expect(isAllowedWebhookUrl('discord', 'http://discord.com/api/webhooks/1/x')).toBe(false);
		expect(isAllowedWebhookUrl('msteams', 'https://logic.azure.com.evil.com/x')).toBe(false);
		expect(isAllowedWebhookUrl('slack', 'not a url')).toBe(false);
	});
});

describe('postJson', () => {
	it('returns true on 2xx', async () => {
		const fetchFn = (async () => new Response('ok', { status: 200 })) as typeof fetch;
		expect(await postJson('https://hooks.slack.com/x', { a: 1 }, fetchFn)).toBe(true);
	});

	it('returns false on http errors and thrown fetch errors', async () => {
		const failing = (async () => new Response('no', { status: 404 })) as typeof fetch;
		const throwing = (async () => {
			throw new Error('network');
		}) as typeof fetch;
		expect(await postJson('https://hooks.slack.com/x', {}, failing)).toBe(false);
		expect(await postJson('https://hooks.slack.com/x', {}, throwing)).toBe(false);
	});

	it('sends the payload as a JSON POST', async () => {
		let seen: { method?: string; body?: unknown } = {};
		const fetchFn = (async (_url: unknown, init?: RequestInit) => {
			seen = { method: init?.method, body: init?.body };
			return new Response('ok', { status: 200 });
		}) as typeof fetch;
		await postJson('https://hooks.slack.com/x', { text: 'hi' }, fetchFn);
		expect(seen.method).toBe('POST');
		expect(seen.body).toBe(JSON.stringify({ text: 'hi' }));
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/server/integrations/webhooks.spec.ts`
Expected: FAIL — cannot resolve `./webhooks`.

- [ ] **Step 3: Implement webhooks.ts**

```ts
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	integrationConnection,
	member,
	type IntegrationProvider
} from '$lib/server/db/schema';
import { payloadFor } from './formatters';
import type { OooMessage } from './message';

/** SSRF guard: only official provider webhook hosts, https only. */
const allowedHost: Record<IntegrationProvider, (host: string) => boolean> = {
	slack: (host) => host === 'hooks.slack.com',
	discord: (host) => host === 'discord.com' || host === 'discordapp.com',
	msteams: (host) =>
		host.endsWith('.logic.azure.com') || host.endsWith('.api.powerplatform.com')
};

export function isAllowedWebhookUrl(provider: IntegrationProvider, raw: string): boolean {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	return url.protocol === 'https:' && allowedHost[provider](url.hostname);
}

export async function postJson(
	url: string,
	payload: unknown,
	fetchFn: typeof fetch = fetch
): Promise<boolean> {
	try {
		const response = await fetchFn(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function recordDeliveryResult(connectionId: string, ok: boolean): Promise<void> {
	await db
		.update(integrationConnection)
		.set(
			ok
				? { consecutiveFailures: 0, lastFailureAt: null }
				: {
						consecutiveFailures: sql`${integrationConnection.consecutiveFailures} + 1`,
						lastFailureAt: new Date()
					}
		)
		.where(eq(integrationConnection.id, connectionId));
}

/** Posts one message to one connection and updates its failure counter. */
export async function deliverToConnection(
	connection: { id: string; provider: IntegrationProvider; webhookUrl: string },
	message: OooMessage
): Promise<boolean> {
	const ok = await postJson(connection.webhookUrl, payloadFor(connection.provider, message));
	await recordDeliveryResult(connection.id, ok);
	return ok;
}

/** Best-effort post to every webhook connection of every team the actor is in. */
export async function postEventToTeamChannels(
	actorId: string,
	message: OooMessage
): Promise<void> {
	const memberships = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, actorId));
	if (memberships.length === 0) return;
	const connections = await db
		.select()
		.from(integrationConnection)
		.where(
			inArray(
				integrationConnection.orgId,
				memberships.map((row) => row.organizationId)
			)
		);
	const results = await Promise.allSettled(
		connections.map((connection) => deliverToConnection(connection, message))
	);
	for (const result of results) {
		if (result.status === 'rejected')
			console.error('[integrations] webhook delivery failed:', result.reason);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- --run src/lib/server/integrations/webhooks.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/integrations/webhooks.ts src/lib/server/integrations/webhooks.spec.ts
git commit -m "feat(integrations): webhook validation and best-effort channel delivery"
```

---

### Task 5: Wire channel posts into event notifications

**Files:**
- Modify: `src/lib/server/notifications.ts` (`notifyEventChange` gains a `range` parameter)
- Modify: `src/routes/app/calendar/+page.server.ts` (both call sites)

**Interfaces:**
- Consumes: `buildEventMessage` from `$lib/server/integrations/message`, `postEventToTeamChannels` from `$lib/server/integrations/webhooks`.
- Produces: new signature `notifyEventChange(actor: { id: string; name: string }, kind: 'created' | 'updated', eventTitle: string | null, eventType: string, range: { allDay: boolean; start: Date; end: Date }): Promise<void>`.

- [ ] **Step 1: Extend notifyEventChange**

In `src/lib/server/notifications.ts`, add imports:

```ts
import { buildEventMessage } from '$lib/server/integrations/message';
import { postEventToTeamChannels } from '$lib/server/integrations/webhooks';
```

Change `notifyEventChange` to:

```ts
/** Notifies everyone who can see the actor's calendar about a created/updated event. */
export async function notifyEventChange(
	actor: { id: string; name: string },
	kind: 'created' | 'updated',
	eventTitle: string | null,
	eventType: string,
	range: { allDay: boolean; start: Date; end: Date }
): Promise<void> {
	const recipients = await getEventAudience(actor.id);
	const type = kind === 'created' ? 'event_created' : 'event_updated';
	await notifyRecipients(recipients, type, actor.name, { eventTitle, eventType }, (recipient) => {
		const locale = recipientLocale(recipient);
		const label = eventTitle ?? eventTypeLabelFor(eventType, locale);
		return eventChangeEmail(actor.name, label, kind, `${env.ORIGIN}/app/calendar`, locale);
	});
	await postEventToTeamChannels(
		actor.id,
		buildEventMessage(actor.name, kind, eventTitle, eventType, range)
	);
}
```

- [ ] **Step 2: Update both call sites in the calendar actions**

In `src/routes/app/calendar/+page.server.ts`, the `save` action (currently ~line 127):

```ts
await notifyEventChange(
	{ id: user.id, name: user.name },
	form.data.id === '' ? 'created' : 'updated',
	values.title,
	values.type,
	{ allDay: values.allDay, start: values.start, end: values.end }
);
```

The `move` action (currently ~line 170):

```ts
await notifyEventChange(
	{ id: user.id, name: user.name },
	'updated',
	updated[0].title,
	updated[0].type,
	{ allDay: form.data.allDay, start: range.start, end: range.end }
);
```

- [ ] **Step 3: Verify**

Run: `pnpm check` — expected 0 errors (a missed call site would fail here).
Run: `pnpm test` — expected PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/notifications.ts src/routes/app/calendar/+page.server.ts
git commit -m "feat(integrations): post event changes to connected team channels"
```

---

### Task 6: iCal feed generator

**Files:**
- Create: `src/lib/server/integrations/ical.ts`
- Test: `src/lib/server/integrations/ical.spec.ts`

**Interfaces:**
- Consumes: `eventTypeLabelFor` from `$lib/events/labels`.
- Produces:
  - `type FeedEvent = { id: string; userName: string; type: string; title: string | null; allDay: boolean; start: Date; end: Date; updatedAt: Date }`
  - `buildIcalFeed(calendarName: string, events: FeedEvent[]): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/integrations/ical.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildIcalFeed, type FeedEvent } from './ical';

function makeEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
	return {
		id: 'evt-1',
		userName: 'Alice',
		type: 'vacation',
		title: null,
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z'),
		updatedAt: new Date('2026-07-01T12:30:45Z'),
		...overrides
	};
}

describe('buildIcalFeed', () => {
	it('produces a VCALENDAR wrapper with CRLF line endings and the calendar name', () => {
		const feed = buildIcalFeed('Team Design', []);
		expect(feed.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(feed.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(feed).toContain('X-WR-CALNAME:Team Design');
	});

	it('maps all-day end-inclusive dates to an exclusive DTEND one day later', () => {
		const feed = buildIcalFeed('x', [makeEvent()]);
		expect(feed).toContain('DTSTART;VALUE=DATE:20260706');
		expect(feed).toContain('DTEND;VALUE=DATE:20260709');
	});

	it('maps timed events to UTC date-times', () => {
		const feed = buildIcalFeed('x', [
			makeEvent({
				allDay: false,
				start: new Date('2026-07-06T09:00:00Z'),
				end: new Date('2026-07-06T17:00:00Z')
			})
		]);
		expect(feed).toContain('DTSTART:20260706T090000Z');
		expect(feed).toContain('DTEND:20260706T170000Z');
	});

	it('builds the summary from name, type label, and optional title', () => {
		const withTitle = buildIcalFeed('x', [makeEvent({ title: 'Trip' })]);
		expect(withTitle).toContain('SUMMARY:Alice — Vacation: Trip');
		const withoutTitle = buildIcalFeed('x', [makeEvent()]);
		expect(withoutTitle).toContain('SUMMARY:Alice — Vacation');
	});

	it('escapes commas, semicolons, and newlines in text values', () => {
		const feed = buildIcalFeed('x', [makeEvent({ title: 'a,b;c\nd' })]);
		expect(feed).toContain('a\\,b\\;c\\nd');
	});

	it('includes UID and DTSTAMP per event', () => {
		const feed = buildIcalFeed('x', [makeEvent()]);
		expect(feed).toContain('UID:evt-1@out-of-office');
		expect(feed).toContain('DTSTAMP:20260701T123045Z');
	});

	it('folds lines longer than 74 characters', () => {
		const feed = buildIcalFeed('x', [makeEvent({ title: 'y'.repeat(120) })]);
		for (const line of feed.split('\r\n')) {
			expect(line.length).toBeLessThanOrEqual(75);
		}
	});
});
```

(As in Task 2, match the `'Vacation'` copy to the real `calendar_event_type_vacation` value in `messages/en.json`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/server/integrations/ical.spec.ts`
Expected: FAIL — cannot resolve `./ical`.

- [ ] **Step 3: Implement ical.ts**

```ts
import { eventTypeLabelFor } from '$lib/events/labels';
import { baseLocale } from '$lib/paraglide/runtime';

export type FeedEvent = {
	id: string;
	userName: string;
	type: string;
	title: string | null;
	allDay: boolean;
	start: Date;
	end: Date;
	updatedAt: Date;
};

function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

const pad = (n: number) => String(n).padStart(2, '0');

function icalDate(date: Date): string {
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function icalDateTime(date: Date): string {
	return `${icalDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 86_400_000);
}

/** RFC 5545 line folding: continuation lines start with a single space. */
function foldLine(line: string): string {
	const parts: string[] = [];
	let rest = line;
	while (rest.length > 74) {
		parts.push(rest.slice(0, 74));
		rest = ` ${rest.slice(74)}`;
	}
	parts.push(rest);
	return parts.join('\r\n');
}

/**
 * Read-only VCALENDAR for a set of events. All-day rows are stored
 * end-inclusive by date part, so DTEND (exclusive per RFC 5545) is end + 1 day.
 */
export function buildIcalFeed(calendarName: string, events: FeedEvent[]): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//out-of-office//EN',
		`X-WR-CALNAME:${escapeText(calendarName)}`
	];
	for (const event of events) {
		const typeLabel = eventTypeLabelFor(event.type, baseLocale);
		const summary = event.title
			? `${event.userName} — ${typeLabel}: ${event.title}`
			: `${event.userName} — ${typeLabel}`;
		lines.push(
			'BEGIN:VEVENT',
			`UID:${event.id}@out-of-office`,
			`DTSTAMP:${icalDateTime(event.updatedAt)}`,
			`SUMMARY:${escapeText(summary)}`
		);
		if (event.allDay) {
			lines.push(
				`DTSTART;VALUE=DATE:${icalDate(event.start)}`,
				`DTEND;VALUE=DATE:${icalDate(addDays(event.end, 1))}`
			);
		} else {
			lines.push(`DTSTART:${icalDateTime(event.start)}`, `DTEND:${icalDateTime(event.end)}`);
		}
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- --run src/lib/server/integrations/ical.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/integrations/ical.ts src/lib/server/integrations/ical.spec.ts
git commit -m "feat(integrations): iCal feed generator"
```

---

### Task 7: Feed tokens + public feed endpoint

**Files:**
- Create: `src/lib/server/integrations/feed-tokens.ts`
- Create: `src/routes/feeds/[token].ics/+server.ts`

**Interfaces:**
- Consumes: `buildIcalFeed`, `FeedEvent` from `./ical`; `calendarFeedToken`, `calendarEvent`, `member`, `organization`, `user` tables.
- Produces (in `$lib/server/integrations/feed-tokens`):
  - `type FeedOwner = { type: 'user' | 'org'; id: string }`
  - `getOrCreateFeedToken(owner: FeedOwner): Promise<string>`
  - `regenerateFeedToken(owner: FeedOwner): Promise<string>`
  - `feedUrl(token: string): string` — `${env.ORIGIN}/feeds/${token}.ics`

- [ ] **Step 1: Implement feed-tokens.ts** (thin DB module — no unit spec, same as other thin DB helpers in this codebase; exercised via the endpoint in final verification)

```ts
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { calendarFeedToken } from '$lib/server/db/schema';

export type FeedOwner = { type: 'user' | 'org'; id: string };

function ownerColumns(owner: FeedOwner) {
	return {
		userId: owner.type === 'user' ? owner.id : null,
		orgId: owner.type === 'org' ? owner.id : null
	};
}

function ownerFilter(owner: FeedOwner) {
	return owner.type === 'user'
		? eq(calendarFeedToken.userId, owner.id)
		: eq(calendarFeedToken.orgId, owner.id);
}

/** Lazily creates the owner's feed token on first access. */
export async function getOrCreateFeedToken(owner: FeedOwner): Promise<string> {
	const inserted = await db
		.insert(calendarFeedToken)
		.values(ownerColumns(owner))
		.onConflictDoNothing()
		.returning({ token: calendarFeedToken.token });
	if (inserted[0]) return inserted[0].token;
	const [existing] = await db
		.select({ token: calendarFeedToken.token })
		.from(calendarFeedToken)
		.where(ownerFilter(owner));
	return existing.token;
}

/** Atomically swaps the token; the old feed URL 404s immediately. */
export async function regenerateFeedToken(owner: FeedOwner): Promise<string> {
	return db.transaction(async (tx) => {
		await tx.delete(calendarFeedToken).where(ownerFilter(owner));
		const [row] = await tx
			.insert(calendarFeedToken)
			.values(ownerColumns(owner))
			.returning({ token: calendarFeedToken.token });
		return row.token;
	});
}

export const feedUrl = (token: string) => `${env.ORIGIN}/feeds/${token}.ics`;
```

- [ ] **Step 2: Implement the endpoint**

Create `src/routes/feeds/[token].ics/+server.ts` (public — the token is the credential, so it lives outside `app/`'s auth guard):

```ts
import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	calendarEvent,
	calendarFeedToken,
	member,
	organization,
	user
} from '$lib/server/db/schema';
import { buildIcalFeed, type FeedEvent } from '$lib/server/integrations/ical';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const [row] = await db
		.select()
		.from(calendarFeedToken)
		.where(eq(calendarFeedToken.token, params.token));
	if (!row) error(404);

	let calendarName: string;
	let userIds: string[];
	if (row.userId) {
		const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, row.userId));
		if (!owner) error(404);
		calendarName = owner.name;
		userIds = [row.userId];
	} else {
		const [org] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, row.orgId ?? ''));
		if (!org) error(404);
		const members = await db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, row.orgId ?? ''));
		calendarName = org.name;
		userIds = members.map((m) => m.userId);
	}

	const events: FeedEvent[] =
		userIds.length === 0
			? []
			: await db
					.select({
						id: calendarEvent.id,
						userName: user.name,
						type: calendarEvent.type,
						title: calendarEvent.title,
						allDay: calendarEvent.allDay,
						start: calendarEvent.start,
						end: calendarEvent.end,
						updatedAt: calendarEvent.updatedAt
					})
					.from(calendarEvent)
					.innerJoin(user, eq(calendarEvent.userId, user.id))
					.where(inArray(calendarEvent.userId, userIds));

	return new Response(buildIcalFeed(calendarName, events), {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
```

- [ ] **Step 3: Verify**

Run: `pnpm check` — expected 0 errors.
Run: `pnpm test` — expected PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/integrations/feed-tokens.ts "src/routes/feeds/[token].ics"
git commit -m "feat(integrations): calendar feed tokens and public .ics endpoint"
```

---

### Task 8: Integration form schemas + UI message keys

**Files:**
- Create: `src/lib/schemas/integration.ts`
- Test: `src/lib/schemas/integration.spec.ts`
- Modify: `messages/en.json`, `messages/fr.json`, `messages/pl.json`

**Interfaces:**
- Produces (in `$lib/schemas/integration`):
  - `integrationProviders = ['slack', 'discord', 'msteams'] as const`
  - `addConnectionSchema` — `{ provider: 'slack' | 'discord' | 'msteams'; webhookUrl: string; label: string }` (label defaults to `''`)
  - `connectionIdSchema` — `{ id: string }`
  - Paraglide keys used by Tasks 9–10 (exact names below).

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/integration.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addConnectionSchema } from './integration';

describe('addConnectionSchema', () => {
	it('accepts a valid connection', () => {
		const result = addConnectionSchema.safeParse({
			provider: 'slack',
			webhookUrl: 'https://hooks.slack.com/services/T0/B0/x',
			label: '#availability'
		});
		expect(result.success).toBe(true);
	});

	it('defaults label to empty and trims the url', () => {
		const result = addConnectionSchema.parse({
			provider: 'discord',
			webhookUrl: '  https://discord.com/api/webhooks/1/x  '
		});
		expect(result.label).toBe('');
		expect(result.webhookUrl).toBe('https://discord.com/api/webhooks/1/x');
	});

	it('rejects unknown providers and non-urls', () => {
		expect(
			addConnectionSchema.safeParse({ provider: 'skype', webhookUrl: 'https://x.test' }).success
		).toBe(false);
		expect(
			addConnectionSchema.safeParse({ provider: 'slack', webhookUrl: 'not a url' }).success
		).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/schemas/integration.spec.ts`
Expected: FAIL — cannot resolve `./integration`.

- [ ] **Step 3: Implement the schema**

Create `src/lib/schemas/integration.ts` (style matches `src/lib/schemas/share.ts`; the provider-host allowlist is enforced server-side in the action, since `isAllowedWebhookUrl` is server-only code):

```ts
import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const integrationProviders = ['slack', 'discord', 'msteams'] as const;

export const addConnectionSchema = z.object({
	provider: z.enum(integrationProviders, { error: () => m.error_generic() }),
	webhookUrl: z
		.string()
		.trim()
		.max(2048)
		.refine((value) => z.url().safeParse(value).success, {
			error: () => m.integrations_invalid_webhook_url()
		}),
	label: z.string().trim().max(100).default('')
});

export const connectionIdSchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() })
});
```

- [ ] **Step 4: Add the UI message keys**

Add to `messages/en.json`:

```json
"integrations_title": "Integrations",
"integrations_description": "Post out-of-office updates to your team's channels.",
"integrations_provider_label": "Provider",
"integrations_webhook_url_label": "Webhook URL",
"integrations_label_label": "Label (optional)",
"integrations_add_cta": "Add connection",
"integrations_added": "Connection added.",
"integrations_removed": "Connection removed.",
"integrations_remove_cta": "Remove",
"integrations_test_cta": "Send test",
"integrations_test_sent": "Test message sent.",
"integrations_test_failed": "Test message failed — check the webhook URL.",
"integrations_invalid_webhook_url": "This is not a valid webhook URL for the selected provider.",
"integrations_failing": "Failing since {date}",
"integrations_empty": "No connections yet.",
"feed_title": "Calendar feed",
"feed_team_description": "Subscribe to this URL from Outlook, Google Calendar, or Apple Calendar to see this team's out-of-office events.",
"feed_user_description": "Subscribe to this URL from Outlook, Google Calendar, or Apple Calendar to see your out-of-office events.",
"feed_copy_cta": "Copy",
"feed_copied": "Feed URL copied.",
"feed_regenerate_cta": "Regenerate",
"feed_regenerated": "Feed URL regenerated. The old URL no longer works."
```

Add matching keys to `messages/fr.json`:

```json
"integrations_title": "Intégrations",
"integrations_description": "Publiez les absences dans les canaux de votre équipe.",
"integrations_provider_label": "Fournisseur",
"integrations_webhook_url_label": "URL du webhook",
"integrations_label_label": "Libellé (facultatif)",
"integrations_add_cta": "Ajouter une connexion",
"integrations_added": "Connexion ajoutée.",
"integrations_removed": "Connexion supprimée.",
"integrations_remove_cta": "Supprimer",
"integrations_test_cta": "Envoyer un test",
"integrations_test_sent": "Message de test envoyé.",
"integrations_test_failed": "Échec du message de test — vérifiez l'URL du webhook.",
"integrations_invalid_webhook_url": "Ceci n'est pas une URL de webhook valide pour ce fournisseur.",
"integrations_failing": "En échec depuis {date}",
"integrations_empty": "Aucune connexion pour le moment.",
"feed_title": "Flux de calendrier",
"feed_team_description": "Abonnez-vous à cette URL depuis Outlook, Google Agenda ou Apple Calendar pour voir les absences de cette équipe.",
"feed_user_description": "Abonnez-vous à cette URL depuis Outlook, Google Agenda ou Apple Calendar pour voir vos absences.",
"feed_copy_cta": "Copier",
"feed_copied": "URL du flux copiée.",
"feed_regenerate_cta": "Régénérer",
"feed_regenerated": "URL du flux régénérée. L'ancienne URL ne fonctionne plus."
```

Add matching keys to `messages/pl.json`:

```json
"integrations_title": "Integracje",
"integrations_description": "Publikuj nieobecności na kanałach swojego zespołu.",
"integrations_provider_label": "Dostawca",
"integrations_webhook_url_label": "Adres URL webhooka",
"integrations_label_label": "Etykieta (opcjonalnie)",
"integrations_add_cta": "Dodaj połączenie",
"integrations_added": "Połączenie dodane.",
"integrations_removed": "Połączenie usunięte.",
"integrations_remove_cta": "Usuń",
"integrations_test_cta": "Wyślij test",
"integrations_test_sent": "Wiadomość testowa wysłana.",
"integrations_test_failed": "Wiadomość testowa nie powiodła się — sprawdź adres webhooka.",
"integrations_invalid_webhook_url": "To nie jest prawidłowy adres webhooka dla wybranego dostawcy.",
"integrations_failing": "Niedziała od {date}",
"integrations_empty": "Brak połączeń.",
"feed_title": "Kanał kalendarza",
"feed_team_description": "Subskrybuj ten adres w Outlooku, Kalendarzu Google lub Apple Calendar, aby widzieć nieobecności tego zespołu.",
"feed_user_description": "Subskrybuj ten adres w Outlooku, Kalendarzu Google lub Apple Calendar, aby widzieć swoje nieobecności.",
"feed_copy_cta": "Kopiuj",
"feed_copied": "Adres kanału skopiowany.",
"feed_regenerate_cta": "Wygeneruj ponownie",
"feed_regenerated": "Adres kanału wygenerowany ponownie. Stary adres już nie działa."
```

Run `pnpm prepare` to regenerate paraglide messages.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit -- --run src/lib/schemas/integration.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/integration.ts src/lib/schemas/integration.spec.ts messages/
git commit -m "feat(integrations): connection form schema and UI copy"
```

---

### Task 9: Team page server — connections load + actions

**Files:**
- Modify: `src/routes/app/teams/[id]/+page.server.ts`

**Interfaces:**
- Consumes: `addConnectionSchema`, `connectionIdSchema` from `$lib/schemas/integration`; `isAllowedWebhookUrl`, `deliverToConnection` from `$lib/server/integrations/webhooks`; `testMessage` from `$lib/server/integrations/message`; `getOrCreateFeedToken`, `regenerateFeedToken`, `feedUrl` from `$lib/server/integrations/feed-tokens`; `integrationConnection` table.
- Produces: `load` returns an extra `integrations` field — `null` for non-managers, else `{ connections: { id: string; provider: 'slack' | 'discord' | 'msteams'; label: string | null; consecutiveFailures: number; lastFailureAt: Date | null }[]; feedUrl: string; connectionForm: SuperValidated<...> }`. Actions: `addConnection`, `removeConnection`, `testConnection`, `regenerateFeed`.

- [ ] **Step 1: Extend the load function**

Add imports to `src/routes/app/teams/[id]/+page.server.ts`:

```ts
import { addConnectionSchema, connectionIdSchema } from '$lib/schemas/integration';
import { integrationConnection } from '$lib/server/db/schema';
import { feedUrl, getOrCreateFeedToken, regenerateFeedToken } from '$lib/server/integrations/feed-tokens';
import { testMessage } from '$lib/server/integrations/message';
import { deliverToConnection, isAllowedWebhookUrl } from '$lib/server/integrations/webhooks';
```

(`integrationConnection` joins the existing import list from `$lib/server/db/schema`.)

In `load`, after the existing form setup, add (managers only — the whole card is manager-only per spec):

```ts
const canManage = membership.role === 'owner' || membership.role === 'admin';
const integrations = canManage
	? {
			connections: await db
				.select({
					id: integrationConnection.id,
					provider: integrationConnection.provider,
					label: integrationConnection.label,
					consecutiveFailures: integrationConnection.consecutiveFailures,
					lastFailureAt: integrationConnection.lastFailureAt
				})
				.from(integrationConnection)
				.where(eq(integrationConnection.orgId, params.id))
				.orderBy(integrationConnection.createdAt),
			feedUrl: feedUrl(await getOrCreateFeedToken({ type: 'org', id: params.id })),
			connectionForm: await superValidate(zod4(addConnectionSchema), { id: 'connection' })
		}
	: null;
```

and include `integrations` in the returned object.

- [ ] **Step 2: Add the four actions**

Append to the `actions` object (patterns copied from the existing actions in this file — superValidate, requireManager, flash redirect):

```ts
addConnection: async (event) => {
	const form = await superValidate(event.request, zod4(addConnectionSchema), {
		id: 'connection'
	});
	if (!form.valid) return fail(400, { form });
	const currentUser = requireUser(event.locals);
	requireManager(await requireMembership(currentUser.id, event.params.id));
	if (!isAllowedWebhookUrl(form.data.provider, form.data.webhookUrl)) {
		return setError(form, 'webhookUrl', m.integrations_invalid_webhook_url());
	}
	await db.insert(integrationConnection).values({
		orgId: event.params.id,
		provider: form.data.provider,
		webhookUrl: form.data.webhookUrl,
		label: form.data.label === '' ? null : form.data.label,
		createdById: currentUser.id
	});
	redirect(
		303,
		teamPath(event.params.id),
		{ type: 'success', message: m.integrations_added() },
		event
	);
},

removeConnection: async (event) => {
	const form = await superValidate(event.request, zod4(connectionIdSchema), { id: 'connection-id' });
	if (!form.valid) return fail(400, { form });
	const currentUser = requireUser(event.locals);
	requireManager(await requireMembership(currentUser.id, event.params.id));
	const deleted = await db
		.delete(integrationConnection)
		.where(
			and(
				eq(integrationConnection.id, form.data.id),
				eq(integrationConnection.orgId, event.params.id)
			)
		)
		.returning({ id: integrationConnection.id });
	if (deleted.length === 0) error(404);
	redirect(
		303,
		teamPath(event.params.id),
		{ type: 'success', message: m.integrations_removed() },
		event
	);
},

testConnection: async (event) => {
	const form = await superValidate(event.request, zod4(connectionIdSchema), { id: 'connection-id' });
	if (!form.valid) return fail(400, { form });
	const currentUser = requireUser(event.locals);
	requireManager(await requireMembership(currentUser.id, event.params.id));
	const [connection] = await db
		.select()
		.from(integrationConnection)
		.where(
			and(
				eq(integrationConnection.id, form.data.id),
				eq(integrationConnection.orgId, event.params.id)
			)
		);
	if (!connection) error(404);
	const ok = await deliverToConnection(connection, testMessage());
	redirect(
		303,
		teamPath(event.params.id),
		ok
			? { type: 'success', message: m.integrations_test_sent() }
			: { type: 'error', message: m.integrations_test_failed() },
		event
	);
},

regenerateFeed: async (event) => {
	const currentUser = requireUser(event.locals);
	requireManager(await requireMembership(currentUser.id, event.params.id));
	await regenerateFeedToken({ type: 'org', id: event.params.id });
	redirect(
		303,
		teamPath(event.params.id),
		{ type: 'success', message: m.feed_regenerated() },
		event
	);
}
```

- [ ] **Step 3: Verify**

Run: `pnpm check` — expected 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/app/teams/[id]/+page.server.ts"
git commit -m "feat(integrations): team connection and feed actions"
```

---

### Task 10: Integrations UI — feed field + integrations card + team page wiring

**Files:**
- Create: `src/lib/components/integrations/feed-url-field.svelte`
- Create: `src/lib/components/integrations/integrations-card.svelte`
- Modify: `src/routes/app/teams/[id]/+page.svelte`

**Interfaces:**
- Consumes: the `integrations` load data from Task 9; shadcn-svelte `Card`, `Item`, `Field`, `Input`, `Select`, `Button`, `Badge`, `Spinner`; `svelte-sonner` `toast`.
- Produces:
  - `feed-url-field.svelte` props: `{ url: string; description: string }` — readonly input + copy button + regenerate submit (posts to `?/regenerateFeed`). Reused by Task 11.
  - `integrations-card.svelte` props: `{ connections: ConnectionRow[]; feedUrl: string; form: SuperValidated<Infer<typeof addConnectionSchema>> }` where `ConnectionRow = { id: string; provider: 'slack' | 'discord' | 'msteams'; label: string | null; consecutiveFailures: number; lastFailureAt: Date | null }`.

- [ ] **Step 1: Create feed-url-field.svelte**

```svelte
<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { m } from '$lib/paraglide/messages.js';

	let { url, description }: { url: string; description: string } = $props();

	async function copy() {
		await navigator.clipboard.writeText(url);
		toast.success(m.feed_copied());
	}
</script>

<div class="grid gap-2">
	<p class="text-sm text-muted-foreground">{description}</p>
	<div class="flex gap-2">
		<Input readonly value={url} class="font-mono text-xs" />
		<Button type="button" variant="outline" onclick={copy}>{m.feed_copy_cta()}</Button>
		<form method="POST" action="?/regenerateFeed">
			<Button type="submit" variant="outline">{m.feed_regenerate_cta()}</Button>
		</form>
	</div>
</div>
```

- [ ] **Step 2: Create integrations-card.svelte**

```svelte
<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { addConnectionSchema } from '$lib/schemas/integration';
	import { toFieldErrors } from '$lib/utils';
	import FeedUrlField from './feed-url-field.svelte';

	type Provider = Infer<typeof addConnectionSchema>['provider'];
	type ConnectionRow = {
		id: string;
		provider: Provider;
		label: string | null;
		consecutiveFailures: number;
		lastFailureAt: Date | null;
	};

	let {
		connections,
		feedUrl,
		form
	}: {
		connections: ConnectionRow[];
		feedUrl: string;
		form: SuperValidated<Infer<typeof addConnectionSchema>>;
	} = $props();

	const providerNames: Record<Provider, string> = {
		slack: 'Slack',
		discord: 'Discord',
		msteams: 'Microsoft Teams'
	};

	// svelte-ignore state_referenced_locally
	const connection = superForm(form, {
		id: 'connection',
		validators: zod4Client(addConnectionSchema)
	});
	const {
		form: connectionData,
		errors: connectionErrors,
		submitting: connectionSubmitting,
		enhance: connectionEnhance
	} = connection;

	const failingSince = (date: Date | null) =>
		date ? m.integrations_failing({ date: date.toLocaleDateString() }) : '';
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.integrations_title()}</Card.Title>
		<Card.Description>{m.integrations_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if connections.length === 0}
			<p class="text-sm text-muted-foreground">{m.integrations_empty()}</p>
		{:else}
			<div class="grid gap-2">
				{#each connections as row (row.id)}
					<Item.Root variant="outline">
						<Item.Content>
							<Item.Title>{row.label ?? providerNames[row.provider]}</Item.Title>
							<Item.Description>
								{providerNames[row.provider]}
								{#if row.consecutiveFailures > 0}
									<Badge variant="destructive">{failingSince(row.lastFailureAt)}</Badge>
								{/if}
							</Item.Description>
						</Item.Content>
						<Item.Actions>
							<form method="POST" action="?/testConnection">
								<input type="hidden" name="id" value={row.id} />
								<Button type="submit" variant="outline" size="sm">
									{m.integrations_test_cta()}
								</Button>
							</form>
							<form method="POST" action="?/removeConnection">
								<input type="hidden" name="id" value={row.id} />
								<Button type="submit" variant="ghost" size="sm">
									{m.integrations_remove_cta()}
								</Button>
							</form>
						</Item.Actions>
					</Item.Root>
				{/each}
			</div>
		{/if}

		<form method="POST" action="?/addConnection" use:connectionEnhance class="grid gap-3">
			<Field.Root>
				<Field.Label for="connection-provider">{m.integrations_provider_label()}</Field.Label>
				<Select.Root type="single" bind:value={$connectionData.provider}>
					<Select.Trigger id="connection-provider" class="w-full">
						{$connectionData.provider ? providerNames[$connectionData.provider] : ''}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="slack">Slack</Select.Item>
						<Select.Item value="discord">Discord</Select.Item>
						<Select.Item value="msteams">Microsoft Teams</Select.Item>
					</Select.Content>
				</Select.Root>
				<input type="hidden" name="provider" value={$connectionData.provider} />
			</Field.Root>
			<Field.Root>
				<Field.Label for="connection-url">{m.integrations_webhook_url_label()}</Field.Label>
				<Input
					id="connection-url"
					name="webhookUrl"
					bind:value={$connectionData.webhookUrl}
					aria-invalid={$connectionErrors.webhookUrl ? 'true' : undefined}
				/>
				<Field.Error errors={toFieldErrors($connectionErrors.webhookUrl)} />
			</Field.Root>
			<Field.Root>
				<Field.Label for="connection-label">{m.integrations_label_label()}</Field.Label>
				<Input id="connection-label" name="label" bind:value={$connectionData.label} />
			</Field.Root>
			<Button type="submit" disabled={$connectionSubmitting} class="justify-self-start">
				{#if $connectionSubmitting}<Spinner />{/if}
				{m.integrations_add_cta()}
			</Button>
		</form>

		<FeedUrlField url={feedUrl} description={m.feed_team_description()} />
	</Card.Content>
</Card.Root>
```

Check `toFieldErrors` in `$lib/utils` for its exact signature (the team page already uses it with error stores) and match the existing call style on that page; if the existing page passes `$errors.field` directly, do the same here.

- [ ] **Step 3: Wire into the team page**

In `src/routes/app/teams/[id]/+page.svelte`, add the import and render the card after the existing cards:

```svelte
import IntegrationsCard from '$lib/components/integrations/integrations-card.svelte';
```

```svelte
{#if data.integrations}
	<IntegrationsCard
		connections={data.integrations.connections}
		feedUrl={data.integrations.feedUrl}
		form={data.integrations.connectionForm}
	/>
{/if}
```

- [ ] **Step 4: Autofix and verify**

Run the Svelte MCP `svelte-autofixer` on both new components and the modified page until clean.
Run: `pnpm check` — expected 0 errors.
Run: `pnpm lint` — expected clean (run `pnpm format` first).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/integrations/ "src/routes/app/teams/[id]/+page.svelte"
git commit -m "feat(integrations): team page integrations card"
```

---

### Task 11: Personal settings — feed URL section

**Files:**
- Modify: `src/routes/app/settings/+page.server.ts`
- Modify: `src/routes/app/settings/+page.svelte`

**Interfaces:**
- Consumes: `getOrCreateFeedToken`, `regenerateFeedToken`, `feedUrl` from `$lib/server/integrations/feed-tokens`; `feed-url-field.svelte` from Task 10.
- Produces: `load` returns an extra `feedUrl: string`; new action `regenerateFeed`.

- [ ] **Step 1: Extend the settings load and actions**

In `src/routes/app/settings/+page.server.ts` add:

```ts
import {
	feedUrl,
	getOrCreateFeedToken,
	regenerateFeedToken
} from '$lib/server/integrations/feed-tokens';
```

In `load`, add to the returned object:

```ts
feedUrl: feedUrl(await getOrCreateFeedToken({ type: 'user', id: user.id }))
```

(the `user` here is the one from `await parent()` — it has an `id` field.)

Add the action:

```ts
regenerateFeed: async (event) => {
	const user = event.locals.user;
	if (!user) throw kitRedirect(303, '/login');
	await regenerateFeedToken({ type: 'user', id: user.id });
	redirect(303, '/app/settings', { type: 'success', message: m.feed_regenerated() }, event);
}
```

- [ ] **Step 2: Render the feed card in settings**

In `src/routes/app/settings/+page.svelte`, import and add a card alongside the existing settings cards (match the page's existing `Card.Root` structure):

```svelte
import FeedUrlField from '$lib/components/integrations/feed-url-field.svelte';
```

```svelte
<Card.Root>
	<Card.Header>
		<Card.Title>{m.feed_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<FeedUrlField url={data.feedUrl} description={m.feed_user_description()} />
	</Card.Content>
</Card.Root>
```

- [ ] **Step 3: Autofix and verify**

Run the Svelte MCP `svelte-autofixer` on the modified page until clean.
Run: `pnpm check` — expected 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app/settings/
git commit -m "feat(integrations): personal calendar feed url in settings"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full automated pass**

Run: `pnpm test` — expected all green.
Run: `pnpm check` — expected 0 errors.
Run: `pnpm lint` — expected clean.

- [ ] **Step 2: Browser verification against the dev database** (memory notes apply: verify against dev Postgres via docker, use the existing test account; reload preview frames after edits)

1. Start the dev server (preview tools) and log in as the test user.
2. Open a team page as owner: the Integrations card renders; add a connection with provider Slack and URL `https://hooks.slack.com/services/T000/B000/fake` — it is accepted (allow-listed host).
3. Click "Send test" — expect the error flash (`integrations_test_failed`), then reload: the connection row shows the failing badge (counter incremented). This proves delivery, counter, and UI health surfacing without a real workspace.
4. Add a connection with URL `https://evil.example.com/x` — expect the inline `integrations_invalid_webhook_url` error.
5. Create a calendar event as a member of that team; confirm the app still works (channel post fails silently against the fake URL) and check server logs show no thrown errors.
6. `curl` the team feed URL shown in the card — expect a `text/calendar` response containing the created event with correct `DTSTART`/`DTEND`.
7. Regenerate the feed; `curl` the old URL — expect 404; the new URL works.
8. Check `/app/settings` shows the personal feed URL; `curl` it — expect only that user's events.
9. Verify a non-manager team member does not see the Integrations card.
10. (Optional, needs a real webhook) Paste a real Discord webhook URL, "Send test", and confirm the message appears in Discord.

- [ ] **Step 3: Confirm delivery to a real provider if available, then hand off**

Use the superpowers:finishing-a-development-branch skill (or open a PR per repo convention — previous features merged via PRs).
