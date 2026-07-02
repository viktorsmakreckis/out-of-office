# Auth Flow — Design

**Date:** 2026-07-02
**Status:** Approved

## Goal

Complete authentication for the out-of-office app: sign up with required email
verification, sign in/out, password reset, and post-signup account management
(profile, email change, password change, account deletion). Timezone and
language (locale) are captured automatically at signup and editable in
settings. Everything is fully internationalized (`en`, `pl`, `fr`).

## Decisions (confirmed with user)

- Email verification is **required** before sign-in.
- Flows in scope: sign up, sign in, sign out, forgot/reset password, change
  password, change email, delete account.
- Timezone and locale are auto-detected and submitted as **hidden** signup
  fields (no visible signup friction); both editable at `/app/settings`.
- Settings is a **single page** at `/app/settings`.
- Forms use **superforms + zod4 server actions** calling better-auth's server
  API (`auth.api.*`) — progressive enhancement, single validation source,
  cookies handled by the existing `sveltekitCookies` plugin. No client-side
  `authClient`.

## Architecture

### 1. Data model & better-auth config

- Add `timezone` (text, default `'UTC'`) and `locale` (text, default `'en'`)
  via `user.additionalFields` in [src/lib/server/auth.ts](../../../src/lib/server/auth.ts).
- Regenerate the drizzle auth schema with the existing `pnpm auth:schema`
  script; create a migration with `pnpm db:generate`.
- better-auth config additions:
  - `emailAndPassword`: `requireEmailVerification: true`, `sendResetPassword`
    (localized email via Resend), revoke other sessions on password reset.
  - `emailVerification`: `sendOnSignUp: true`,
    `autoSignInAfterVerification: true`, localized `sendVerificationEmail`.
  - `user.changeEmail.enabled: true` — verification email sent to the **new**
    address.
  - `user.deleteUser.enabled: true` — password-confirmed, no email round-trip.

### 2. Email layer

`src/lib/server/email.ts`:

- Resend client using `RESEND_API_KEY` / `RESEND_EMAIL_ADDRESS`.
- Three template functions: verify email, reset password, confirm email
  change. Plain minimal HTML with a single action link.
- Localized with paraglide messages, using the recipient's stored locale (or
  the current request locale at signup).

### 3. Routes & guards

```
src/routes/
  +page.server.ts              → redirect(302, '/app')  (always; /app guard handles auth)
  (auth)/
    +layout.server.ts          → signed in? redirect to /app
    +layout.svelte             → centered card shell
    login/
    signup/
    forgot-password/
    reset-password/            → token from query string
    verify-email/              → "check your inbox" + resend action
  app/
    +layout.server.ts          → no session? redirect to /login
    +layout.svelte             → app shell (navigation-menu + user dropdown-menu)
    +page.svelte               → Home placeholder
    settings/                  → profile + account superforms
```

- Signup redirects to `verify-email`; the verification link in the email is
  better-auth's own endpoint with `callbackURL=/app`.
- `/` always redirects to `/app`; unauthenticated users bounce from `/app` to
  `/login`.

### 4. Forms & validation

- Zod4 schemas in `src/lib/schemas/auth.ts`; error messages localized via
  paraglide `m.*()` calls inside zod4 `error` callbacks (locale resolves
  per-request on the server).
- better-auth `APIError` codes (invalid credentials, email exists, email not
  verified, invalid/expired token, …) mapped to localized form or flash
  errors.
- Signup hidden fields: timezone from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, locale from the current
  paraglide locale. Server validates against
  `Intl.supportedValuesOf('timeZone')` and paraglide `locales`, falling back
  to defaults when JS is disabled.
- Forms are structured with the shadcn-svelte `field` components.

### 5. App shell (`/app` layout)

- Header with `navigation-menu` containing a single **Home** item (`/app`).
- Avatar-triggered `dropdown-menu`:
  - Settings (link to `/app/settings`)
  - Theme sub-menu: light / dark / system via mode-watcher (`ModeWatcher`
    added to the root layout)
  - Language sub-menu: en / pl / fr as localized links (paraglide URL
    strategy)
  - Separator, then Sign out (form action → `auth.api.signOut` → `/login`).

### 6. Settings page (`/app/settings`)

Four `field`-structured superforms on one page:

1. **Profile** — name, language select, timezone select. Saving language also
   switches the UI locale.
2. **Change email** — sends verification to the new address; flash "check
   your inbox".
3. **Change password** — current + new password; revokes other sessions.
4. **Delete account** — password confirmation inside an `alert-dialog`;
   afterwards sign out and redirect to `/login`.

### 7. i18n completeness

Every user-facing string — page copy, form labels, zod errors, better-auth
error mappings, flash messages, email subjects/bodies, page `<title>`s — goes
through paraglide messages in `en`, `pl`, and `fr`.

### 8. Testing

- Vitest (node project) unit tests for the zod schemas and the better-auth
  error-code mapping.
- All flows verified manually against the docker-compose Postgres with the
  dev server. No E2E infrastructure added.

## Error handling

- Validation errors: inline per-field via superforms + `field-error`.
- better-auth API errors: mapped to localized inline form errors (e.g. wrong
  credentials) or flash toasts (e.g. rate-limit/unexpected).
- Unexpected failures (Resend down, DB error): generic localized flash error;
  never leak raw error text.
- Email enumeration: forgot-password always reports success regardless of
  whether the account exists.

## Out of scope

- Social/OAuth providers, 2FA, passkeys.
- E2E test infrastructure.
- Any `/app` functionality beyond the shell and settings.
