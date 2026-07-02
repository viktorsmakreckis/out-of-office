# Auth Rate Limiting — Design

**Date:** 2026-07-02
**Status:** Approved
**Builds on:** [2026-07-02-auth-flow-design.md](2026-07-02-auth-flow-design.md)

## Goal

Throttle authentication operations so passwords cannot be brute-forced and
auth emails (verification, reset, change-email) cannot be sent without limit.
No new infrastructure: Postgres (already running) backs all counters. Redis is
deliberately out of scope — it only pays off with horizontal scaling and real
traffic, neither of which applies to this single-instance adapter-node app.

## The two attack surfaces

1. **Form actions** — the app's superforms actions call `auth.api.*`
   server-side, which bypasses better-auth's rate limiter entirely (it only
   wraps the HTTP handler). Covered by a custom Postgres-backed throttle
   helper.
2. **Public `/api/auth/*` endpoints** — mounted by `svelteKitHandler` in
   `hooks.server.ts`, directly reachable regardless of our forms. Covered by
   better-auth's built-in `rateLimit` option with `storage: "database"` so
   counters are durable and shared.

## Design

### 1. better-auth built-in limiter (surface 2)

In `src/lib/server/auth.ts`:

```ts
rateLimit: {
	enabled: true, // default is production-only; enable everywhere for testability
	storage: 'database'
}
```

- Regenerate the auth drizzle schema (`pnpm auth:schema`) — this adds
  better-auth's `rateLimit` model table — and create/apply a migration.
- Rely on better-auth's built-in per-endpoint rules (it ships stricter
  defaults for sign-in etc.); custom rules only if the installed version's
  defaults prove too loose at implementation time (verify against the
  installed 1.4.22 source, as done for the auth flow).

### 2. Postgres throttle helper (surface 1)

New table (app schema, `src/lib/server/db/schema.ts`, separate from
better-auth's model):

```
auth_rate_limit (
  key      text primary key,   -- e.g. 'login:email:foo@bar.com'
  count    integer not null,
  reset_at timestamptz not null
)
```

New module `src/lib/server/rate-limit.ts`:

```ts
interface RateLimitRule {
	key: string;
	max: number;
	windowSeconds: number;
}

/** True if ALL rules pass; increments every matching counter atomically. */
export async function checkRateLimit(...rules: RateLimitRule[]): Promise<boolean>;
```

- Fixed-window counter, one atomic statement per rule (race-safe, no
  read-modify-write):

```sql
INSERT INTO auth_rate_limit (key, count, reset_at)
VALUES ($key, 1, now() + $window)
ON CONFLICT (key) DO UPDATE SET
  count    = CASE WHEN auth_rate_limit.reset_at < now() THEN 1 ELSE auth_rate_limit.count + 1 END,
  reset_at = CASE WHEN auth_rate_limit.reset_at < now() THEN now() + $window ELSE auth_rate_limit.reset_at END
RETURNING count
```

  `allowed = count <= max` for every rule. Windows self-reset in place;
  opportunistic cleanup deletes rows expired for more than a day (piggybacked
  on ~1% of checks) so the table stays bounded.
- Attempts are counted before calling `auth.api.*` (i.e. successes count
  too) — simpler, and it also caps email-sending endpoints regardless of
  outcome.

### 3. Enforcement points and limits

Applied at the top of each action, after form validation, before `auth.api.*`:

| Action | Per-email / per-user | Per-IP |
| --- | --- | --- |
| login | 5 / 15 min | 10 / 15 min |
| signup | — | 10 / 1 h |
| forgot-password | 3 / 1 h | 10 / 1 h |
| verify-email resend | 3 / 1 h | 10 / 1 h |
| settings: change email | 3 / 1 h (user id) | — |
| settings: change password | 5 / 15 min (user id) | — |
| settings: delete account | 5 / 15 min (user id) | — |

- IP from `event.getClientAddress()`; email keys lowercased; settings actions
  key on the session user id (already authenticated).
- Keys namespaced per action: `login:email:<e>`, `login:ip:<ip>`, etc., so
  limits don't bleed across flows.

### 4. User-facing behavior

- New message key `rate_limit_exceeded` in `en`/`pl`/`fr` (e.g. "Too many
  attempts. Please try again later.").
- Login/signup/reset/settings actions: form-level error via
  `setError(form, '', m.rate_limit_exceeded())`.
- Forgot-password: **flash-success as usual** even when limited (silently
  skip the API call) — a visible limit error would reintroduce the account
  enumeration signal that action deliberately avoids. The IP/email counters
  still stop the email spam.

### 5. Testing

- Vitest unit tests for `checkRateLimit` against the dev Postgres
  (DATABASE_URL from `.env`, docker compose): under-limit allows,
  over-limit blocks, window reset restores, multiple rules evaluated
  together. Tests use a unique key prefix and clean up after themselves.
- Manual spot-check in the browser: 6 failed logins → localized error toast;
  forgot-password stays enumeration-safe.

## Out of scope

- Redis / external stores (revisit only with multi-instance deployment).
- Proxy/CDN-level limiting (recommended defense-in-depth for a serious
  public deployment, but deployment-specific and not app code).
- Counting only failures / resetting counters on successful login (YAGNI).
- CAPTCHA, account lockout, or notification emails on excessive attempts.
