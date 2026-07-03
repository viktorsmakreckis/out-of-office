# Landing Page Design

**Date:** 2026-07-03
**Status:** Approved

## Purpose

A marketing landing page for Out of Office at `/`, shown to logged-out visitors. It sells
the product's real features — shared out-of-office calendars, the fortnight availability
board, teams and sharing, notifications — and funnels visitors to sign-up.

## Decisions

- **Screenshots:** real captures of the running app (seeded demo data), light and dark
  variants swapped via `dark:hidden` / `hidden dark:block`.
- **Routing:** logged-in users at `/` are redirected to `/app`; logged-out visitors see
  the landing page.
- **Sections:** nav, hero, features, how-it-works, FAQ, final CTA, footer. No pricing,
  no testimonials.
- **i18n:** all copy as `landing_*` keys in `messages/en.json`, `pl.json`, `fr.json`.
- **Visual direction:** warm vacation editorial — sunset coral/amber accent palette,
  oversized display headlines, sun-and-horizon gradient motif. Base surfaces keep the
  existing neutral shadcn tokens so dark mode continues to work.

## Architecture

### Routing

`src/routes/+page.server.ts` replaces its unconditional redirect with:

- `locals.user` present → `redirect(303, '/app')`
- otherwise → return (render the landing page)

`src/routes/+page.svelte` becomes the landing page, composed of section components.

### Components

One file per section under `src/lib/components/landing/`:

| Component | Content |
| --- | --- |
| `landing-nav.svelte` | Wordmark, anchor links (Features, How it works, FAQ), Log in (ghost Button), Get started (primary Button). Sticky. |
| `landing-hero.svelte` | Oversized headline with warm accent word, subcopy, two CTAs (Sign up free → `/signup`, See how it works → `#how-it-works`), hero screenshot of the calendar month view in a browser-style frame with a warm gradient glow behind it. |
| `landing-features.svelte` | Bento-style grid of the four real features: shared calendar with drag & drop, fortnight availability board, teams & calendar sharing, in-app + email notifications. Two large cells carry real screenshots (availability board; sharing/teams), two smaller cells use Lucide icon + copy. |
| `landing-how-it-works.svelte` | Three numbered steps: create your calendar → add your time off → share it with your team. |
| `landing-faq.svelte` | Accordion (existing `ui/accordion`): is it free, how sharing works, supported languages, whether teammates can edit my calendar. |
| `landing-cta.svelte` | Full-width warm gradient panel, big headline, sign-up Button. |
| `landing-footer.svelte` | Wordmark, section links, log in / sign up links, copyright. |

Existing shadcn-svelte components (`button`, `accordion`, `badge`, etc.) are used wherever
they fit; no new ui primitives.

### Theming

Warm accent colors are added as new `--color-sunset-*` entries in the Tailwind `@theme`
block of `src/routes/layout.css`, without touching the app's existing token values. All structural colors use existing tokens
(`bg-background`, `text-muted-foreground`, `border-border`) so the page is legible in
both light and dark mode.

### Screenshots

- Seed the dev Postgres with demo data that photographs well: a handful of users with
  varied, colorful events across the visible fortnight, following the known dev-DB
  seeding conventions.
- Capture with browser tooling at desktop size in light and dark mode:
  1. calendar month view (hero),
  2. home fortnight availability board (feature cell),
  3. sharing/teams view (feature cell).
- Store under `src/lib/assets/landing/`, imported as plain `<img>` with explicit
  `width`/`height` to avoid layout shift. Hero image loads eagerly; below-fold images
  use `loading="lazy"`. Localized `alt` text for all.

### i18n

Every visible string goes through paraglide messages (`landing_*` prefix) in `en`, `pl`,
`fr`, matching app conventions.

## Error handling

The only branch is the auth redirect in the page server load. No forms, no mutations.
Broken image imports fail at build time (Vite asset imports), so no runtime handling is
needed.

## Testing & verification

- The page contains almost no logic; verification is primarily visual:
  browser checks (logged-in redirect, logged-out landing) at mobile/tablet/desktop
  widths in light and dark mode.
- Code quality gates: `svelte-autofixer` on every component, `pnpm check`, `pnpm lint`,
  `pnpm test`.

## Out of scope

- Pricing and testimonial sections.
- SEO/OG image generation beyond basic `<title>`/`<meta name="description">`.
- Any changes to the app (`/app`) itself.
