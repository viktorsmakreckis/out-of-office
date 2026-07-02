# Auth Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Throttle auth form actions (Postgres fixed-window counters) and the public `/api/auth/*` endpoints (better-auth's built-in limiter, database storage) so passwords can't be brute-forced and auth emails can't be spammed.

**Architecture:** A tiny `auth_rate_limit` table + `checkRateLimit()` helper does one atomic upsert per rule (race-safe, self-resetting windows); each sensitive form action checks per-email/per-user and per-IP rules before calling `auth.api.*`. Separately, better-auth's own `rateLimit` option is enabled with `storage: 'database'` to cover the publicly mounted endpoints that bypass our forms.

**Tech Stack:** drizzle-orm (postgres-js), better-auth 1.4.22, sveltekit-superforms, paraglide (en/pl/fr), vitest against the docker-compose Postgres.

## Global Constraints

- Branch: `feat/auth-flow` (stacked on the auth-flow PR). Spec: `docs/superpowers/specs/2026-07-02-auth-rate-limiting-design.md`.
- Every user-facing string via paraglide `m.*()`; new key `rate_limit_exceeded` must exist in `messages/en.json`, `messages/pl.json`, `messages/fr.json`.
- Limits (verbatim from spec): login 5/15min per email + 10/15min per IP; signup 10/1h per IP; forgot-password 3/1h per email + 10/1h per IP; verify-email resend 3/1h per email + 10/1h per IP; settings change-email 3/1h per user, change-password 5/15min per user, delete-account 5/15min per user.
- Key format: `<action>:<kind>:<value>` — e.g. `login:email:foo@bar.com` (emails lowercased), `login:ip:1.2.3.4`, `change-email:user:<id>`.
- Forgot-password must stay enumeration-safe: when limited, silently SKIP the API call but still flash success.
- Attempts are counted before calling `auth.api.*` (successes count too).
- Commits: conventional prefixes, **never add a Co-Authored-By trailer**.
- Repo conventions: prettier-formatted; `pnpm lint`, `pnpm check` (0 errors 0 warnings), `pnpm test` must stay green. Dev DB: `docker compose up -d`. Vitest loads `.env`, so `DATABASE_URL` is available in tests.

---

### Task 1: `auth_rate_limit` table + `checkRateLimit` helper

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create: `src/lib/server/rate-limit.ts`
- Test: `src/lib/server/rate-limit.spec.ts`
- Create: `drizzle/` migration (via CLI)

**Interfaces:**
- Consumes: `db` from `$lib/server/db`.
- Produces (used by Task 3):
  - `interface RateLimitRule { key: string; max: number; windowSeconds: number }`
  - `checkRateLimit(...rules: RateLimitRule[]): Promise<boolean>` — increments every rule's counter atomically; returns true only if ALL rules are within their `max`.
  - Drizzle table `authRateLimit` exported from `src/lib/server/db/schema.ts` (columns: `key` text PK, `count` integer notNull, `resetAt` timestamptz notNull).

- [ ] **Step 1: Add the table to `src/lib/server/db/schema.ts`**

The file currently only re-exports the generated auth schema. Replace with:

```ts
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export * from './auth.schema';

/** Fixed-window counters for app-level auth throttling (see rate-limit.ts). */
export const authRateLimit = pgTable('auth_rate_limit', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	resetAt: timestamp('reset_at', { withTimezone: true }).notNull()
});
```

- [ ] **Step 2: Write the failing test** — `src/lib/server/rate-limit.spec.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, like, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authRateLimit } from '$lib/server/db/schema';
import { checkRateLimit } from './rate-limit';

const prefix = `test:${crypto.randomUUID()}`;
const key = (name: string) => `${prefix}:${name}`;

beforeAll(async () => {
	// Fails fast with a clear message when the dev DB isn't up.
	await db.execute(sql`select 1`);
});

afterAll(async () => {
	await db.delete(authRateLimit).where(like(authRateLimit.key, `${prefix}:%`));
});

describe('checkRateLimit', () => {
	it('allows up to max attempts, then blocks', async () => {
		const rule = { key: key('block'), max: 3, windowSeconds: 60 };
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(false);
	});

	it('resets the counter after the window expires', async () => {
		const rule = { key: key('reset'), max: 1, windowSeconds: 60 };
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(false);
		// Simulate window expiry instead of sleeping.
		await db
			.update(authRateLimit)
			.set({ resetAt: sql`now() - interval '1 second'` })
			.where(eq(authRateLimit.key, key('reset')));
		expect(await checkRateLimit(rule)).toBe(true);
	});

	it('blocks when any one of several rules is exceeded', async () => {
		const strict = { key: key('multi-strict'), max: 1, windowSeconds: 60 };
		const loose = { key: key('multi-loose'), max: 100, windowSeconds: 60 };
		expect(await checkRateLimit(strict, loose)).toBe(true);
		expect(await checkRateLimit(strict, loose)).toBe(false);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker compose up -d && pnpm vitest run src/lib/server/rate-limit.spec.ts`
Expected: FAIL — cannot resolve `./rate-limit` (and `authRateLimit` doesn't exist in the DB yet; the module error comes first).

- [ ] **Step 4: Generate and apply the migration**

Run: `pnpm db:generate --name rate-limit && pnpm db:migrate`
Expected: a new SQL file under `drizzle/` creating `auth_rate_limit` (text PK, integer, timestamptz); applies cleanly.

- [ ] **Step 5: Write `src/lib/server/rate-limit.ts`**

```ts
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authRateLimit } from '$lib/server/db/schema';

export interface RateLimitRule {
	key: string;
	max: number;
	windowSeconds: number;
}

/**
 * Fixed-window rate limiter. Increments every rule's counter atomically and
 * returns true only when ALL rules are within their max. Windows self-reset
 * in place, so no scheduled cleanup is needed for active keys.
 */
export async function checkRateLimit(...rules: RateLimitRule[]): Promise<boolean> {
	let allowed = true;
	for (const rule of rules) {
		const reset = sql`now() + make_interval(secs => ${rule.windowSeconds})`;
		const [row] = await db
			.insert(authRateLimit)
			.values({ key: rule.key, count: 1, resetAt: reset })
			.onConflictDoUpdate({
				target: authRateLimit.key,
				set: {
					count: sql`CASE WHEN ${authRateLimit.resetAt} < now() THEN 1 ELSE ${authRateLimit.count} + 1 END`,
					resetAt: sql`CASE WHEN ${authRateLimit.resetAt} < now() THEN now() + make_interval(secs => ${rule.windowSeconds}) ELSE ${authRateLimit.resetAt} END`
				}
			})
			.returning({ count: authRateLimit.count });
		if (row.count > rule.max) allowed = false;
	}
	// Opportunistic cleanup of long-dead keys; never blocks the caller.
	if (Math.random() < 0.01) {
		db.delete(authRateLimit)
			.where(sql`${authRateLimit.resetAt} < now() - interval '1 day'`)
			.catch(() => {});
	}
	return allowed;
}
```

Type note: drizzle accepts an `SQL` value for a column in `.values(...)`; if the installed drizzle version rejects the typed assignment, cast that one property (`resetAt: reset as unknown as Date`) rather than restructuring.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run src/lib/server/rate-limit.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Full suite + commit**

Run: `pnpm test` (expect 17 passing) and `pnpm check` (0 errors).

```bash
git add src/lib/server/db/schema.ts src/lib/server/rate-limit.ts src/lib/server/rate-limit.spec.ts drizzle/
git commit -m "feat(auth): add postgres-backed rate limit helper"
```

---

### Task 2: Enable better-auth's built-in limiter for public endpoints

**Files:**
- Modify: `src/lib/server/auth.ts` (add `rateLimit` option)
- Regenerate: `src/lib/server/db/auth.schema.ts` (via `pnpm auth:schema`)
- Create: `drizzle/` migration (via CLI)

**Interfaces:**
- Consumes: existing `auth` config.
- Produces: `/api/auth/*` endpoints rate-limited per IP with durable counters (better-auth's `rateLimit` model table). No app-code consumers.

- [ ] **Step 1: Add the option to `src/lib/server/auth.ts`**

Insert into the `betterAuth({ ... })` options object (sibling of `emailAndPassword`, e.g. right after `database`):

```ts
	rateLimit: {
		enabled: true, // default is production-only; keep it on in dev so it's testable
		storage: 'database'
	},
```

Leave window/max at better-auth defaults — v1.4.22 ships a built-in special rule (3 req / 10 s per IP) for `/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*` (verified in `node_modules/better-auth/dist/api/rate-limiter/index.mjs`, `getDefaultSpecialRules`).

- [ ] **Step 2: Regenerate the auth schema**

Run: `pnpm auth:schema`
Expected: `src/lib/server/db/auth.schema.ts` gains a `rateLimit` table (model for database storage). Only additions — inspect the diff. If the CLI does NOT emit the table, report DONE_WITH_CONCERNS with the diff rather than hand-writing it.

- [ ] **Step 3: Generate and apply the migration**

Run: `pnpm db:generate --name better-auth-rate-limit && pnpm db:migrate`
Expected: migration creating better-auth's rate-limit table; applies cleanly.

- [ ] **Step 4: Verify**

Run: `pnpm check && pnpm test`
Expected: 0 errors; 17 passing.

Live check (optional but cheap): `docker compose up -d`, start `RESEND_API_KEY="" pnpm dev` in the background, then hammer the public endpoint:

```bash
for i in 1 2 3 4; do curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5173/api/auth/sign-in/email -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' -d '{"email":"nobody@example.com","password":"wrongpassword"}'; done
```

Expected: three `401`s then a `429`. Stop the dev server afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/auth.ts src/lib/server/db/auth.schema.ts drizzle/
git commit -m "feat(auth): enable better-auth rate limiting with database storage"
```

---

### Task 3: Enforce limits in form actions + localized error

**Files:**
- Modify: `messages/en.json`, `messages/pl.json`, `messages/fr.json` (one key each)
- Modify: `src/routes/(auth)/login/+page.server.ts`
- Modify: `src/routes/(auth)/signup/+page.server.ts`
- Modify: `src/routes/(auth)/forgot-password/+page.server.ts`
- Modify: `src/routes/(auth)/verify-email/+page.server.ts`
- Modify: `src/routes/app/settings/+page.server.ts`

**Interfaces:**
- Consumes: `checkRateLimit`/`RateLimitRule` from `$lib/server/rate-limit` (Task 1); existing `setError`, flash `redirect`, `m`.
- Produces: user-visible throttling; no new exports.

- [ ] **Step 1: Add the message key to all three catalogs**

In `messages/en.json` (after `"error_generic"`):

```json
	"rate_limit_exceeded": "Too many attempts. Please try again later.",
```

`messages/pl.json`:

```json
	"rate_limit_exceeded": "Zbyt wiele prób. Spróbuj ponownie później.",
```

`messages/fr.json`:

```json
	"rate_limit_exceeded": "Trop de tentatives. Veuillez réessayer plus tard.",
```

- [ ] **Step 2: Login** — `src/routes/(auth)/login/+page.server.ts`

Add the import and insert the check between form validation and the `try`:

```ts
import { checkRateLimit } from '$lib/server/rate-limit';
```

```ts
		if (!form.valid) return fail(400, { form });

		const limitOk = await checkRateLimit(
			{ key: `login:email:${form.data.email.toLowerCase()}`, max: 5, windowSeconds: 900 },
			{ key: `login:ip:${event.getClientAddress()}`, max: 10, windowSeconds: 900 }
		);
		if (!limitOk) return setError(form, '', m.rate_limit_exceeded());
```

- [ ] **Step 3: Signup** — `src/routes/(auth)/signup/+page.server.ts`

Same import; after the `!form.valid` guard:

```ts
		const limitOk = await checkRateLimit({
			key: `signup:ip:${event.getClientAddress()}`,
			max: 10,
			windowSeconds: 3600
		});
		if (!limitOk) return setError(form, '', m.rate_limit_exceeded());
```

- [ ] **Step 4: Forgot password (enumeration-safe skip)** — `src/routes/(auth)/forgot-password/+page.server.ts`

Same import; replace the action body between the `!form.valid` guard and the final redirect with:

```ts
		const limitOk = await checkRateLimit(
			{ key: `forgot:email:${form.data.email.toLowerCase()}`, max: 3, windowSeconds: 3600 },
			{ key: `forgot:ip:${event.getClientAddress()}`, max: 10, windowSeconds: 3600 }
		);

		if (limitOk) {
			try {
				await auth.api.requestPasswordReset({
					body: { email: form.data.email, redirectTo: '/reset-password' }
				});
			} catch (error) {
				// Always report success so account existence can't be probed.
				console.error('requestPasswordReset failed', error);
			}
		}

		redirect(303, '/login', { type: 'success', message: m.auth_forgot_sent() }, event);
```

(When limited: no API call, no email, same success flash — the enumeration posture is unchanged.)

- [ ] **Step 5: Verify-email resend** — `src/routes/(auth)/verify-email/+page.server.ts`

Same import; after the `!form.valid` guard:

```ts
		const limitOk = await checkRateLimit(
			{ key: `resend:email:${form.data.email.toLowerCase()}`, max: 3, windowSeconds: 3600 },
			{ key: `resend:ip:${event.getClientAddress()}`, max: 10, windowSeconds: 3600 }
		);
		if (!limitOk) return setError(form, '', m.rate_limit_exceeded());
```

- [ ] **Step 6: Settings actions** — `src/routes/app/settings/+page.server.ts`

Add imports:

```ts
import { redirect as kitRedirect } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/rate-limit';
```

(`fail` is already imported from `@sveltejs/kit`; extend that import instead of adding a duplicate — `import { fail, redirect as kitRedirect } from '@sveltejs/kit';`. The flash `redirect` import stays as-is.)

Then in each of the three email-sending/credential actions, after the `!form.valid` guard, insert (each action keys on the authenticated user; bounce stray unauthenticated POSTs first):

`changeEmail`:

```ts
		const user = event.locals.user;
		if (!user) kitRedirect(303, '/login');
		const limitOk = await checkRateLimit({
			key: `change-email:user:${user.id}`,
			max: 3,
			windowSeconds: 3600
		});
		if (!limitOk) return setError(form, 'newEmail', m.rate_limit_exceeded());
```

`changePassword`:

```ts
		const user = event.locals.user;
		if (!user) kitRedirect(303, '/login');
		const limitOk = await checkRateLimit({
			key: `change-password:user:${user.id}`,
			max: 5,
			windowSeconds: 900
		});
		if (!limitOk) return setError(form, 'currentPassword', m.rate_limit_exceeded());
```

`deleteAccount`:

```ts
		const user = event.locals.user;
		if (!user) kitRedirect(303, '/login');
		const limitOk = await checkRateLimit({
			key: `delete-account:user:${user.id}`,
			max: 5,
			windowSeconds: 900
		});
		if (!limitOk) return setError(form, 'password', m.rate_limit_exceeded());
```

(The `profile` action mutates no credentials and sends no email — no limit, per spec.)

Type note: after `if (!user) kitRedirect(303, '/login');` TypeScript may not narrow `user` (kitRedirect returns `never` but isn't annotated as such in older versions — it is in current SvelteKit; if narrowing fails, use `throw kitRedirect(...)`).

- [ ] **Step 7: Static verification**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: all clean; 17 tests passing.

- [ ] **Step 8: Browser spot-check**

`docker compose up -d`, dev server via `RESEND_API_KEY="" pnpm dev` (background). Using the preview tools:
1. Sign up + verify a throwaway user (`sdd-rl-test@example.com`; verification URL in server console).
2. Sign out. Attempt login with the wrong password 6 times → the 6th shows the localized "Too many attempts" form error (5/15min per email).
3. Forgot-password 4 times for the same email → all four show the normal success flash; the server console shows reset emails for the first 3 only.
4. Clean up: delete the test user row AND the test counters:
   `docker compose exec -T db psql -U root -d local -c "DELETE FROM \"user\" WHERE email = 'sdd-rl-test@example.com'; DELETE FROM auth_rate_limit;"`
5. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add messages/ "src/routes/(auth)" src/routes/app/settings
git commit -m "feat(auth): rate limit auth form actions"
```
