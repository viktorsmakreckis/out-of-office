# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A marketing landing page at `/` for logged-out visitors (logged-in users redirect to `/app`), with real product screenshots, warm "vacation editorial" styling, and full en/pl/fr i18n.

**Architecture:** `src/routes/+page.server.ts` becomes a conditional redirect; `src/routes/+page.svelte` composes seven section components from `src/lib/components/landing/`. Screenshots are captured from the seeded dev app with Playwright and stored under `src/lib/assets/landing/`. Warm accent colors are new `--color-sunset-*` Tailwind theme tokens.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), Tailwind v4, shadcn-svelte (`button`, `accordion`), paraglide i18n, vitest, Playwright (scratch install, capture only).

**Spec:** `docs/superpowers/specs/2026-07-03-landing-page-design.md`

## Design intent (read before styling anything)

- **Direction:** warm vacation editorial. Base surfaces stay on existing neutral tokens (`bg-background`, `bg-card`, `border`, `text-muted-foreground`) so dark mode keeps working. Warmth comes only from the `sunset-*` accent scale.
- **Signature device:** the hero opens like an email auto-reply — a pill chip reading "Automatic reply: I'm out of office" — and a coral sun-glow rises behind the hero screenshot's top edge (the "horizon"). The sun-disc wordmark repeats it in nav and footer. This is the page's one bold element; everything else stays quiet.
- **Type:** Inter Variable only. Display = `font-extrabold tracking-tighter` at `text-5xl`–`text-7xl`. No serif, no new fonts.
- **Motion:** one hero load-in (fade/slide via tw-animate-css), `motion-reduce:animate-none` everywhere animation is used. Nothing scroll-triggered.
- **Copy:** OOO-email vernacular, plain verbs, sentence case. All copy lives in paraglide messages (Task 2) — never hardcode strings in components.

## Global Constraints

- Package manager: `pnpm`. Run all commands from the repo root `/Users/viktorsm/WebstormProjects/personal/out-of-office` unless a step says otherwise.
- **Never add a `Co-Authored-By` trailer to commits** (repo owner's explicit standing rule).
- Indentation is tabs (prettier config). After creating/editing files, run `pnpm exec prettier --write <files>` before committing.
- Internal links: `resolve('/path' as Pathname)` with `import { resolve } from '$app/paths'` and `import type { Pathname } from '$app/types'`. Same-page anchors (`#features`) are plain `href`s.
- i18n: `import { m } from '$lib/paraglide/messages.js'`, call `m.landing_*()`. Message keys are flat snake_case.
- Lucide icons: default import from `@lucide/svelte/icons/<name>`.
- Every new/edited `.svelte` file must pass the Svelte MCP autofixer (`mcp__svelte__svelte-autofixer`; load via ToolSearch if deferred) with no remaining issues, and `pnpm check` must pass.
- Dev Postgres: seed/fix via `docker exec -i out-of-office-db-1 psql -U root -d local` (the `-i` is required for heredocs). The postgres MCP is read-only.
- Test account: `dash-tester@example.com` / `dash-tester-pass-123`.

---

### Task 1: Root route — conditional redirect + page shell

**Files:**
- Modify: `src/routes/+page.server.ts`
- Create: `src/routes/page.server.spec.ts` (cannot start with `+` — SvelteKit reserves that prefix)
- Create: `src/routes/+page.svelte` (temporary shell, filled in by Tasks 4–8)

**Interfaces:**
- Produces: `GET /` renders `+page.svelte` for anonymous visitors; redirects (303) to `/app` when `locals.user` is set. Tasks 4–8 replace/extend `+page.svelte`.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/landing-page
```

- [ ] **Step 2: Write the failing test**

Create `src/routes/page.server.spec.ts`:

```ts
import { isRedirect, type Redirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

function runLoad(user: unknown): Redirect | undefined {
	try {
		load({ locals: { user } } as unknown as Parameters<typeof load>[0]);
	} catch (e) {
		if (isRedirect(e)) return e;
		throw e;
	}
	return undefined;
}

describe('root page load', () => {
	it('redirects a signed-in user to /app', () => {
		const redirect = runLoad({ id: 'u1' });
		expect(redirect?.status).toBe(303);
		expect(redirect?.location).toBe('/app');
	});

	it('renders the landing page for anonymous visitors', () => {
		expect(runLoad(undefined)).toBeUndefined();
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test:unit -- --run src/routes/page.server.spec.ts`
Expected: FAIL — the second test throws, because the current `load` redirects unconditionally.

- [ ] **Step 4: Make the redirect conditional**

Replace the whole of `src/routes/+page.server.ts` with:

```ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app');
};
```

- [ ] **Step 5: Create the temporary page shell**

Create `src/routes/+page.svelte` (without it the `/` route 404s):

```svelte
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.app_name()}</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center">
	<h1 class="text-2xl font-semibold tracking-tight">{m.app_name()}</h1>
</main>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test:unit -- --run src/routes/page.server.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Autofix + typecheck**

Run `mcp__svelte__svelte-autofixer` on `src/routes/+page.svelte` until clean, then:
Run: `pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 8: Format and commit**

```bash
pnpm exec prettier --write src/routes/+page.server.ts src/routes/+page.svelte src/routes/page.server.spec.ts
git add src/routes/+page.server.ts src/routes/+page.svelte src/routes/page.server.spec.ts
git commit -m "feat: serve landing shell at / for anonymous visitors"
```

---

### Task 2: Foundation — sunset color tokens + all landing copy (en/pl/fr)

**Files:**
- Modify: `src/routes/layout.css` (append a `@theme` block)
- Modify: `messages/en.json`, `messages/pl.json`, `messages/fr.json`

**Interfaces:**
- Produces: Tailwind utilities `bg-sunset-{50..700}`, `text-sunset-*`, `border-sunset-*`, and CSS vars `--color-sunset-*`; paraglide functions `m.landing_*()` used by Tasks 4–8.

- [ ] **Step 1: Add the sunset scale to `src/routes/layout.css`**

Insert this block **between** the `.dark { ... }` block and the existing `@theme inline { ... }` block:

```css
@theme {
	--color-sunset-50: oklch(0.985 0.012 75);
	--color-sunset-100: oklch(0.955 0.035 70);
	--color-sunset-200: oklch(0.9 0.07 62);
	--color-sunset-300: oklch(0.84 0.11 68);
	--color-sunset-400: oklch(0.75 0.155 48);
	--color-sunset-500: oklch(0.66 0.19 38);
	--color-sunset-600: oklch(0.58 0.18 33);
	--color-sunset-700: oklch(0.5 0.16 30);
}
```

Do not touch any existing token.

- [ ] **Step 2: Add English copy to `messages/en.json`**

Append these keys before the closing brace (keep valid JSON — mind the comma on the previous last entry):

```json
"landing_meta_title": "The shared time-off calendar for small teams",
"landing_meta_description": "A shared time-off calendar for small teams. Add your days away, share your calendar, and nobody has to ask who's off.",
"landing_nav_features": "Features",
"landing_nav_how_it_works": "How it works",
"landing_nav_faq": "FAQ",
"landing_nav_login": "Log in",
"landing_nav_signup": "Get started",
"landing_hero_chip": "Automatic reply: I'm out of office",
"landing_hero_title_accent": "Gone.",
"landing_hero_title_rest": "And everyone knows when you're back.",
"landing_hero_subtitle": "Out of Office is a shared time-off calendar for small teams. Add your days away, share your calendar with people or whole teams, and nobody has to ask around.",
"landing_hero_cta_start": "Start free",
"landing_hero_cta_how": "See how it works",
"landing_hero_screenshot_alt": "Month view of a team calendar with color-coded time-off events",
"landing_features_title": "Everything a team needs to be away",
"landing_features_subtitle": "Six kinds of time off, one shared picture of who's where.",
"landing_feature_board_title": "The next two weeks, at a glance",
"landing_feature_board_description": "The home board lines up everyone's absences for the coming fortnight — who's away right now, and when they're back.",
"landing_feature_board_alt": "Availability board showing teammates' absences over two weeks",
"landing_feature_calendar_title": "A real calendar, not a spreadsheet",
"landing_feature_calendar_description": "Month, week, and agenda views. Drag an event to move it. Vacation, sick leave, business trips, remote days — each in its own color.",
"landing_feature_sharing_title": "Share with a person or a whole team",
"landing_feature_sharing_description": "Share your calendar with a teammate by email, or create a team and everyone sees each other automatically. Unshare any time.",
"landing_feature_sharing_alt": "Sharing screen with teams and individual calendar shares",
"landing_feature_notifications_title": "Know when plans change",
"landing_feature_notifications_description": "When someone adds or moves time off, the people who share a calendar with them hear about it — in the app and by email.",
"landing_how_title": "Out of office in three steps",
"landing_how_step1_title": "Add your days away",
"landing_how_step1_description": "Create an account and put your vacation, trips, and remote days on the calendar.",
"landing_how_step2_title": "Share your calendar",
"landing_how_step2_description": "Invite teammates to a team, or share with individual people by email.",
"landing_how_step3_title": "Everyone plans around it",
"landing_how_step3_description": "Your team sees who's away and when you're back — nobody has to ask.",
"landing_faq_title": "Questions, answered",
"landing_faq_free_question": "Is Out of Office free?",
"landing_faq_free_answer": "Yes. Create an account, invite your team, and use the whole product for free.",
"landing_faq_edit_question": "Can teammates change my calendar?",
"landing_faq_edit_answer": "No. Shared calendars are view-only — only you can add, move, or delete your own events.",
"landing_faq_sharing_question": "How does sharing work?",
"landing_faq_sharing_answer": "You can share your calendar with individual people by email, or create a team where everyone sees each other. Recipients can share back from a notification, and you can hide or revoke a share at any time.",
"landing_faq_languages_question": "What languages does it speak?",
"landing_faq_languages_answer": "English, French, and Polish.",
"landing_cta_title": "Set your out-of-office once, for everyone.",
"landing_cta_subtitle": "It takes a minute to add your first time off.",
"landing_cta_button": "Create your calendar",
"landing_footer_tagline": "The shared time-off calendar for small teams.",
"landing_footer_copyright": "© {year} Out of Office"
```

- [ ] **Step 3: Add Polish copy to `messages/pl.json`**

Same keys, these values:

```json
"landing_meta_title": "Wspólny kalendarz urlopów dla małych zespołów",
"landing_meta_description": "Wspólny kalendarz urlopów dla małych zespołów. Dodaj swoje dni wolne, udostępnij kalendarz i nikt nie musi pytać, kto jest nieobecny.",
"landing_nav_features": "Funkcje",
"landing_nav_how_it_works": "Jak to działa",
"landing_nav_faq": "FAQ",
"landing_nav_login": "Zaloguj się",
"landing_nav_signup": "Rozpocznij",
"landing_hero_chip": "Odpowiedź automatyczna: jestem poza biurem",
"landing_hero_title_accent": "Nieobecny.",
"landing_hero_title_rest": "I wszyscy wiedzą, kiedy wracasz.",
"landing_hero_subtitle": "Out of Office to wspólny kalendarz urlopów dla małych zespołów. Dodaj swoje dni wolne, udostępnij kalendarz osobom lub całym zespołom — i nikt nie musi dopytywać.",
"landing_hero_cta_start": "Zacznij za darmo",
"landing_hero_cta_how": "Zobacz, jak to działa",
"landing_hero_screenshot_alt": "Widok miesiąca w kalendarzu zespołu z kolorowymi wydarzeniami nieobecności",
"landing_features_title": "Wszystko, czego zespół potrzebuje, żeby spokojnie wyjechać",
"landing_features_subtitle": "Sześć rodzajów nieobecności, jeden wspólny obraz tego, kto gdzie jest.",
"landing_feature_board_title": "Najbliższe dwa tygodnie w jednym spojrzeniu",
"landing_feature_board_description": "Tablica na stronie głównej zestawia nieobecności wszystkich na nadchodzące dwa tygodnie — kto jest teraz nieobecny i kiedy wraca.",
"landing_feature_board_alt": "Tablica dostępności pokazująca nieobecności współpracowników w ciągu dwóch tygodni",
"landing_feature_calendar_title": "Prawdziwy kalendarz, nie arkusz",
"landing_feature_calendar_description": "Widok miesiąca, tygodnia i agendy. Przeciągnij wydarzenie, żeby je przenieść. Urlop, chorobowe, delegacje, praca zdalna — każde w swoim kolorze.",
"landing_feature_sharing_title": "Udostępniaj osobie lub całemu zespołowi",
"landing_feature_sharing_description": "Udostępnij kalendarz współpracownikowi przez e-mail albo załóż zespół, w którym wszyscy widzą się nawzajem. Cofniesz udostępnienie w każdej chwili.",
"landing_feature_sharing_alt": "Ekran udostępniania z zespołami i pojedynczymi udostępnieniami kalendarza",
"landing_feature_notifications_title": "Wiedz, kiedy plany się zmieniają",
"landing_feature_notifications_description": "Gdy ktoś doda lub przesunie nieobecność, osoby, które widzą jego kalendarz, dowiedzą się o tym — w aplikacji i mailem.",
"landing_how_title": "Poza biurem w trzech krokach",
"landing_how_step1_title": "Dodaj swoje dni wolne",
"landing_how_step1_description": "Załóż konto i wpisz do kalendarza urlopy, wyjazdy i dni pracy zdalnej.",
"landing_how_step2_title": "Udostępnij kalendarz",
"landing_how_step2_description": "Zaproś współpracowników do zespołu albo udostępnij kalendarz pojedynczym osobom przez e-mail.",
"landing_how_step3_title": "Zespół planuje z wyprzedzeniem",
"landing_how_step3_description": "Wszyscy widzą, kto jest nieobecny i kiedy wracasz — nikt nie musi pytać.",
"landing_faq_title": "Pytania i odpowiedzi",
"landing_faq_free_question": "Czy Out of Office jest darmowe?",
"landing_faq_free_answer": "Tak. Załóż konto, zaproś zespół i korzystaj ze wszystkiego za darmo.",
"landing_faq_edit_question": "Czy współpracownicy mogą zmieniać mój kalendarz?",
"landing_faq_edit_answer": "Nie. Udostępnione kalendarze są tylko do odczytu — tylko Ty możesz dodawać, przenosić i usuwać swoje wydarzenia.",
"landing_faq_sharing_question": "Jak działa udostępnianie?",
"landing_faq_sharing_answer": "Możesz udostępnić kalendarz pojedynczym osobom przez e-mail albo założyć zespół, w którym wszyscy widzą się nawzajem. Odbiorca może odwzajemnić udostępnienie z poziomu powiadomienia, a Ty możesz w każdej chwili ukryć lub cofnąć udostępnienie.",
"landing_faq_languages_question": "W jakich językach działa aplikacja?",
"landing_faq_languages_answer": "Po angielsku, francusku i polsku.",
"landing_cta_title": "Ustaw swoje „poza biurem” raz — dla wszystkich.",
"landing_cta_subtitle": "Dodanie pierwszej nieobecności zajmuje minutę.",
"landing_cta_button": "Utwórz swój kalendarz",
"landing_footer_tagline": "Wspólny kalendarz urlopów dla małych zespołów.",
"landing_footer_copyright": "© {year} Out of Office"
```

- [ ] **Step 4: Add French copy to `messages/fr.json`**

```json
"landing_meta_title": "Le calendrier d'absences partagé pour les petites équipes",
"landing_meta_description": "Un calendrier d'absences partagé pour les petites équipes. Ajoutez vos jours d'absence, partagez votre calendrier, et personne n'a besoin de demander qui est absent.",
"landing_nav_features": "Fonctionnalités",
"landing_nav_how_it_works": "Comment ça marche",
"landing_nav_faq": "FAQ",
"landing_nav_login": "Se connecter",
"landing_nav_signup": "Commencer",
"landing_hero_chip": "Réponse automatique : je suis absent du bureau",
"landing_hero_title_accent": "Absent.",
"landing_hero_title_rest": "Et tout le monde sait quand vous revenez.",
"landing_hero_subtitle": "Out of Office est un calendrier d'absences partagé pour les petites équipes. Ajoutez vos jours d'absence, partagez votre calendrier avec des personnes ou des équipes entières — et personne n'a besoin de demander.",
"landing_hero_cta_start": "Commencer gratuitement",
"landing_hero_cta_how": "Voir comment ça marche",
"landing_hero_screenshot_alt": "Vue mensuelle d'un calendrier d'équipe avec des absences en couleurs",
"landing_features_title": "Tout ce qu'il faut à une équipe pour s'absenter",
"landing_features_subtitle": "Six types d'absence, une seule vue partagée de qui est où.",
"landing_feature_board_title": "Les deux prochaines semaines, d'un coup d'œil",
"landing_feature_board_description": "Le tableau d'accueil aligne les absences de chacun pour la quinzaine à venir — qui est absent en ce moment, et quand il revient.",
"landing_feature_board_alt": "Tableau de disponibilité montrant les absences de l'équipe sur deux semaines",
"landing_feature_calendar_title": "Un vrai calendrier, pas un tableur",
"landing_feature_calendar_description": "Vues mois, semaine et agenda. Faites glisser un événement pour le déplacer. Congés, arrêts maladie, déplacements, télétravail — chacun dans sa couleur.",
"landing_feature_sharing_title": "Partagez avec une personne ou toute une équipe",
"landing_feature_sharing_description": "Partagez votre calendrier avec un collègue par e-mail, ou créez une équipe où tout le monde se voit automatiquement. Annulez un partage à tout moment.",
"landing_feature_sharing_alt": "Écran de partage avec équipes et partages individuels de calendrier",
"landing_feature_notifications_title": "Sachez quand les plans changent",
"landing_feature_notifications_description": "Quand quelqu'un ajoute ou déplace une absence, les personnes qui voient son calendrier en sont informées — dans l'application et par e-mail.",
"landing_how_title": "Absent du bureau en trois étapes",
"landing_how_step1_title": "Ajoutez vos jours d'absence",
"landing_how_step1_description": "Créez un compte et mettez vos congés, déplacements et jours de télétravail au calendrier.",
"landing_how_step2_title": "Partagez votre calendrier",
"landing_how_step2_description": "Invitez vos collègues dans une équipe, ou partagez avec des personnes individuelles par e-mail.",
"landing_how_step3_title": "L'équipe s'organise autour",
"landing_how_step3_description": "Tout le monde voit qui est absent et quand vous revenez — personne n'a besoin de demander.",
"landing_faq_title": "Questions, réponses",
"landing_faq_free_question": "Out of Office est-il gratuit ?",
"landing_faq_free_answer": "Oui. Créez un compte, invitez votre équipe et utilisez tout le produit gratuitement.",
"landing_faq_edit_question": "Mes collègues peuvent-ils modifier mon calendrier ?",
"landing_faq_edit_answer": "Non. Les calendriers partagés sont en lecture seule — vous seul pouvez ajouter, déplacer ou supprimer vos événements.",
"landing_faq_sharing_question": "Comment fonctionne le partage ?",
"landing_faq_sharing_answer": "Vous pouvez partager votre calendrier avec des personnes par e-mail, ou créer une équipe où tout le monde se voit. Le destinataire peut partager en retour depuis une notification, et vous pouvez masquer ou révoquer un partage à tout moment.",
"landing_faq_languages_question": "Quelles langues sont disponibles ?",
"landing_faq_languages_answer": "L'anglais, le français et le polonais.",
"landing_cta_title": "Réglez votre absence une fois, pour tout le monde.",
"landing_cta_subtitle": "Ajouter votre première absence prend une minute.",
"landing_cta_button": "Créez votre calendrier",
"landing_footer_tagline": "Le calendrier d'absences partagé pour les petites équipes.",
"landing_footer_copyright": "© {year} Out of Office"
```

- [ ] **Step 5: Compile paraglide and typecheck**

Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`
Expected: exits 0, no missing-message warnings for `landing_*` keys.
Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 6: Format and commit**

```bash
pnpm exec prettier --write src/routes/layout.css messages/en.json messages/pl.json messages/fr.json
git add src/routes/layout.css messages/
git commit -m "feat: sunset accent tokens and landing page copy (en/pl/fr)"
```

---

### Task 3: Screenshot assets — seed demo data, capture with Playwright

Produces the six images every later visual task depends on. Run this before Tasks 5–6.

**Files:**
- Create: `src/lib/assets/landing/calendar-light.png` (2048×1280), `calendar-dark.png` (2048×1280)
- Create: `src/lib/assets/landing/board-light.png` (2368×1536), `board-dark.png`, `sharing-light.png`, `sharing-dark.png` (all 2368×1536)
- Scratch (not committed): `$SHOTS` — throughout this task, `SHOTS=/private/tmp/claude-501/-Users-viktorsm-WebstormProjects-personal-out-of-office/e8a5a3dc-a195-4a31-9b7a-215753e12153/scratchpad/shots`

**Interfaces:**
- Produces: the six PNGs at exactly the dimensions above (Tasks 5–6 hardcode them in `width`/`height` attributes).

- [ ] **Step 1: Ensure Postgres and the dev server are up**

```bash
docker exec out-of-office-db-1 pg_isready -U root || docker compose up -d
curl -sf http://localhost:5173 >/dev/null || echo "dev server not running"
```

If the dev server is not running, start it in the background: `RESEND_API_KEY= pnpm dev` (background Bash), then poll `curl -sf http://localhost:5173` until it responds.

- [ ] **Step 2: Verify the demo accounts exist**

```bash
docker exec -i out-of-office-db-1 psql -U root -d local -c "select email, name from \"user\" where email like 'sdd-%' or email = 'dash-tester@example.com' order by email;"
```

Expected: 4 rows — `dash-tester@example.com` plus three `sdd-*` users (alice/bob/dave). **If any are missing, stop and report** — do not invent replacement accounts.

- [ ] **Step 3: Seed photogenic demo data**

```bash
docker exec -i out-of-office-db-1 psql -U root -d local <<'SQL'
update "user" set name = 'Maja Lindqvist' where email = 'dash-tester@example.com';
update "user" set name = 'Alice Moreau'   where email like 'sdd-alice%';
update "user" set name = 'Bob Kowalski'   where email like 'sdd-bob%';
update "user" set name = 'Dave Okafor'    where email like 'sdd-dave%';
update organization set name = 'Brightside Studio' where name = 'Dashboard Demo Team';

delete from calendar_event
where user_id in (select id from "user" where email like 'sdd-%' or email = 'dash-tester@example.com')
	and start >= '2026-06-20' and start < '2026-08-15';

insert into calendar_event (id, user_id, type, title, all_day, start, "end") values
(gen_random_uuid()::text, (select id from "user" where email like 'sdd-alice%'), 'vacation', 'Sardinia 🏖️', true, '2026-07-06 00:00:00+00', '2026-07-17 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email like 'sdd-bob%'), 'business_trip', 'Berlin — client visit', true, '2026-07-07 00:00:00+00', '2026-07-09 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email = 'dash-tester@example.com'), 'remote_work', 'Lake house', true, '2026-07-13 00:00:00+00', '2026-07-15 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email like 'sdd-dave%'), 'sick_leave', null, true, '2026-07-02 00:00:00+00', '2026-07-03 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email like 'sdd-dave%'), 'public_holiday', 'Bastille Day', true, '2026-07-14 00:00:00+00', '2026-07-14 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email like 'sdd-bob%'), 'remote_work', 'Remote from Gdańsk', true, '2026-07-20 00:00:00+00', '2026-07-22 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email = 'dash-tester@example.com'), 'vacation', 'Alps hike', true, '2026-07-23 00:00:00+00', '2026-07-29 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email like 'sdd-dave%'), 'vacation', 'Cottage week', true, '2026-07-27 00:00:00+00', '2026-07-31 00:00:00+00'),
(gen_random_uuid()::text, (select id from "user" where email like 'sdd-alice%'), 'other', 'Moving day', true, '2026-07-31 00:00:00+00', '2026-07-31 00:00:00+00');
SQL
```

Then verify: `docker exec -i out-of-office-db-1 psql -U root -d local -c "select count(*) from calendar_event where start >= '2026-07-01' and start < '2026-08-01';"`
Expected: 9 (or more if other users have July events — at least 9).

- [ ] **Step 4: Install Playwright in the scratchpad (not the project)**

```bash
SHOTS=/private/tmp/claude-501/-Users-viktorsm-WebstormProjects-personal-out-of-office/e8a5a3dc-a195-4a31-9b7a-215753e12153/scratchpad/shots
mkdir -p "$SHOTS/out" && cd "$SHOTS"
npm init -y && npm i playwright && npx playwright install chromium
```

- [ ] **Step 5: Write and run the capture script**

Create `$SHOTS/capture.mjs`:

```js
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
// Sidebar is 16rem = 256px, app header is 48px; clips crop to the content area.
const CONTENT_CLIP = { x: 256, y: 48, width: 1184, height: 768 };
const shots = [
	{ name: 'calendar', path: '/app/calendar?view=month&date=2026-07-01&filter=all' },
	{ name: 'board', path: '/app', clip: CONTENT_CLIP },
	{ name: 'sharing', path: '/app/sharing', clip: CONTENT_CLIP }
];

const browser = await chromium.launch();
for (const colorScheme of ['light', 'dark']) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme,
		locale: 'en-US'
	});
	const page = await context.newPage();
	await page.goto(`${BASE}/login`);
	await page.fill('#login-email', 'dash-tester@example.com');
	await page.fill('#login-password', 'dash-tester-pass-123');
	await page.click('button[type="submit"]');
	await page.waitForURL('**/app');
	await page.waitForTimeout(5000); // let the login toast expire
	for (const { name, path, clip } of shots) {
		await page.goto(BASE + path);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000); // fonts + layout settle
		await page.screenshot({ path: `out/${name}-${colorScheme}.png`, ...(clip ? { clip } : {}) });
		console.log(`captured ${name}-${colorScheme}`);
	}
	await context.close();
}
await browser.close();
```

Run: `cd "$SHOTS" && node capture.mjs`
Expected: six "captured ..." lines, six PNGs in `out/`.

- [ ] **Step 6: Inspect the captures**

Read each PNG with the Read tool. Check: calendar shows July 2026 with ~9 colorful events and no error states; board shows named teammates with absence bars; sharing shows "Brightside Studio"; dark variants are actually dark. If a page looks broken or empty, fix the seed/navigation and re-capture — do not ship a bad screenshot.

- [ ] **Step 7: Downscale the hero captures and verify all dimensions**

```bash
cd "$SHOTS/out"
sips -Z 2048 calendar-light.png calendar-dark.png
for f in *.png; do sips -g pixelWidth -g pixelHeight "$f"; done
```

Expected: `calendar-*` = 2048×1280; `board-*` and `sharing-*` = 2368×1536. Exactly — later tasks hardcode these.

- [ ] **Step 8: Move into the repo and commit**

```bash
mkdir -p src/lib/assets/landing
cp "$SHOTS"/out/*.png src/lib/assets/landing/
git add src/lib/assets/landing
git commit -m "feat: landing page product screenshots (light/dark)"
```

---

### Task 4: Nav + footer, wired into the page

**Files:**
- Create: `src/lib/components/landing/landing-nav.svelte`
- Create: `src/lib/components/landing/landing-footer.svelte`
- Modify: `src/routes/+page.svelte` (replace the Task 1 shell)

**Interfaces:**
- Consumes: `m.landing_nav_*`, `m.landing_meta_*`, `m.landing_footer_*` (Task 2); `sunset-*` utilities (Task 2).
- Produces: `+page.svelte` with an empty `<main class="flex-1">` that Tasks 5–8 fill; section anchor ids `#features`, `#how-it-works`, `#faq` are linked from nav and footer and must match later tasks.

- [ ] **Step 1: Create `src/lib/components/landing/landing-nav.svelte`**

```svelte
<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
</script>

<header class="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
	<nav class="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
		<a href={resolve('/' as Pathname)} class="flex items-center gap-2 font-semibold tracking-tight">
			<span class="flex size-6 items-center justify-center rounded-full bg-sunset-500 text-white">
				<SunIcon class="size-4" />
			</span>
			{m.app_name()}
		</a>
		<div class="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
			<a href="#features" class="transition-colors hover:text-foreground">{m.landing_nav_features()}</a>
			<a href="#how-it-works" class="transition-colors hover:text-foreground">
				{m.landing_nav_how_it_works()}
			</a>
			<a href="#faq" class="transition-colors hover:text-foreground">{m.landing_nav_faq()}</a>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="ghost" href={resolve('/login' as Pathname)}>{m.landing_nav_login()}</Button>
			<Button
				href={resolve('/signup' as Pathname)}
				class="bg-sunset-500 text-white hover:bg-sunset-600"
			>
				{m.landing_nav_signup()}
			</Button>
		</div>
	</nav>
</header>
```

- [ ] **Step 2: Create `src/lib/components/landing/landing-footer.svelte`**

```svelte
<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { m } from '$lib/paraglide/messages.js';
</script>

<footer class="border-t px-4 py-10 sm:px-6">
	<div class="mx-auto flex max-w-6xl flex-col justify-between gap-6 sm:flex-row sm:items-center">
		<div>
			<p class="flex items-center gap-2 font-semibold tracking-tight">
				<span class="flex size-6 items-center justify-center rounded-full bg-sunset-500 text-white">
					<SunIcon class="size-4" />
				</span>
				{m.app_name()}
			</p>
			<p class="mt-2 text-sm text-muted-foreground">{m.landing_footer_tagline()}</p>
		</div>
		<nav class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
			<a href="#features" class="transition-colors hover:text-foreground">{m.landing_nav_features()}</a>
			<a href="#how-it-works" class="transition-colors hover:text-foreground">
				{m.landing_nav_how_it_works()}
			</a>
			<a href="#faq" class="transition-colors hover:text-foreground">{m.landing_nav_faq()}</a>
			<a href={resolve('/login' as Pathname)} class="transition-colors hover:text-foreground">
				{m.landing_nav_login()}
			</a>
			<a href={resolve('/signup' as Pathname)} class="transition-colors hover:text-foreground">
				{m.landing_nav_signup()}
			</a>
		</nav>
	</div>
	<p class="mx-auto mt-8 max-w-6xl text-sm text-muted-foreground">
		{m.landing_footer_copyright({ year: new Date().getFullYear().toString() })}
	</p>
</footer>
```

- [ ] **Step 3: Replace `src/routes/+page.svelte` with the composed layout**

```svelte
<script lang="ts">
	import LandingFooter from '$lib/components/landing/landing-footer.svelte';
	import LandingNav from '$lib/components/landing/landing-nav.svelte';
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.app_name()} · {m.landing_meta_title()}</title>
	<meta name="description" content={m.landing_meta_description()} />
</svelte:head>

<div class="flex min-h-svh flex-col">
	<LandingNav />
	<main class="flex-1"></main>
	<LandingFooter />
</div>
```

- [ ] **Step 4: Autofix, typecheck, verify in browser**

Run `mcp__svelte__svelte-autofixer` on all three files until clean. Run `pnpm check` (expect 0 errors). Then with the dev server running, load `http://localhost:5173/` in a **logged-out** context (the browser preview may hold a dash-tester session — check via snapshot; if logged in, verify redirect to `/app` works, then use a fresh context/incognito or clear cookies to see the landing). Confirm nav and footer render with the sun wordmark and coral CTA.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write src/lib/components/landing src/routes/+page.svelte
git add src/lib/components/landing src/routes/+page.svelte
git commit -m "feat: landing nav and footer"
```

---

### Task 5: Hero — auto-reply chip, display headline, sun-glow screenshot

**Files:**
- Create: `src/lib/components/landing/landing-hero.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `m.landing_hero_*` (Task 2), `src/lib/assets/landing/calendar-{light,dark}.png` at 2048×1280 (Task 3).

- [ ] **Step 1: Create `src/lib/components/landing/landing-hero.svelte`**

```svelte
<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import ReplyIcon from '@lucide/svelte/icons/reply';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
	import calendarDark from '$lib/assets/landing/calendar-dark.png';
	import calendarLight from '$lib/assets/landing/calendar-light.png';
</script>

<section class="overflow-hidden px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
	<div
		class="animate-in fade-in slide-in-from-bottom-4 mx-auto flex max-w-6xl flex-col items-center text-center duration-700 motion-reduce:animate-none"
	>
		<p
			class="flex items-center gap-2 rounded-full border border-sunset-200 bg-sunset-50 px-4 py-1.5 text-sm font-medium text-sunset-700 dark:border-sunset-500/30 dark:bg-sunset-500/10 dark:text-sunset-300"
		>
			<ReplyIcon class="size-4" />
			{m.landing_hero_chip()}
		</p>
		<h1 class="mt-6 max-w-3xl text-5xl font-extrabold tracking-tighter text-balance sm:text-7xl">
			<span class="text-sunset-500">{m.landing_hero_title_accent()}</span>
			{m.landing_hero_title_rest()}
		</h1>
		<p class="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
			{m.landing_hero_subtitle()}
		</p>
		<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
			<Button
				size="lg"
				href={resolve('/signup' as Pathname)}
				class="bg-sunset-500 text-white hover:bg-sunset-600"
			>
				{m.landing_hero_cta_start()}
			</Button>
			<Button size="lg" variant="outline" href="#how-it-works">{m.landing_hero_cta_how()}</Button>
		</div>
	</div>

	<div
		class="animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards relative mx-auto mt-16 max-w-5xl duration-700 [animation-delay:150ms] motion-reduce:animate-none sm:mt-20"
	>
		<div
			aria-hidden="true"
			class="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--color-sunset-300),var(--color-sunset-500)_55%,transparent_72%)] opacity-80 blur-2xl sm:-top-36 sm:size-[28rem]"
		></div>
		<div class="relative overflow-hidden rounded-xl border shadow-2xl">
			<div class="flex h-8 items-center gap-1.5 border-b bg-muted px-3" aria-hidden="true">
				<span class="size-2.5 rounded-full bg-sunset-400"></span>
				<span class="size-2.5 rounded-full bg-sunset-300"></span>
				<span class="size-2.5 rounded-full bg-sunset-200"></span>
			</div>
			<img
				src={calendarLight}
				alt={m.landing_hero_screenshot_alt()}
				width="2048"
				height="1280"
				class="block w-full dark:hidden"
			/>
			<img
				src={calendarDark}
				alt={m.landing_hero_screenshot_alt()}
				width="2048"
				height="1280"
				class="hidden w-full dark:block"
			/>
		</div>
	</div>
</section>
```

- [ ] **Step 2: Wire it into `src/routes/+page.svelte`**

Add the import and place inside `<main>`:

```svelte
import LandingHero from '$lib/components/landing/landing-hero.svelte';
```

```svelte
<main class="flex-1">
	<LandingHero />
</main>
```

- [ ] **Step 3: Autofix, typecheck, verify in browser**

Autofixer until clean; `pnpm check` → 0 errors. In a logged-out browser context, reload `/`: chip, two-tone headline (coral "Gone."), both CTAs, and the framed screenshot with the sun glow behind its top edge. Toggle dark mode (emulate `prefers-color-scheme: dark`) and confirm the dark screenshot swaps in.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec prettier --write src/lib/components/landing/landing-hero.svelte src/routes/+page.svelte
git add src/lib/components/landing/landing-hero.svelte src/routes/+page.svelte
git commit -m "feat: landing hero with auto-reply chip and sunrise screenshot"
```

---

### Task 6: Features bento grid

**Files:**
- Create: `src/lib/components/landing/landing-features.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `m.landing_features_*`/`m.landing_feature_*` (Task 2); `board-*.png` and `sharing-*.png` at 2368×1536 (Task 3).
- Produces: section id `features` (nav/footer link target).

- [ ] **Step 1: Create `src/lib/components/landing/landing-features.svelte`**

```svelte
<script lang="ts">
	import BellRingIcon from '@lucide/svelte/icons/bell-ring';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import { m } from '$lib/paraglide/messages.js';
	import boardDark from '$lib/assets/landing/board-dark.png';
	import boardLight from '$lib/assets/landing/board-light.png';
	import sharingDark from '$lib/assets/landing/sharing-dark.png';
	import sharingLight from '$lib/assets/landing/sharing-light.png';
</script>

<section id="features" class="scroll-mt-20 px-4 py-20 sm:px-6">
	<div class="mx-auto max-w-6xl">
		<h2 class="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">
			{m.landing_features_title()}
		</h2>
		<p class="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
			{m.landing_features_subtitle()}
		</p>
		<div class="mt-12 grid gap-4 md:grid-cols-5">
			<article class="flex flex-col overflow-hidden rounded-2xl border bg-card md:col-span-3">
				<div class="p-6 pb-4">
					<h3 class="text-lg font-semibold tracking-tight">{m.landing_feature_board_title()}</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">
						{m.landing_feature_board_description()}
					</p>
				</div>
				<div class="mt-auto h-64 pl-6">
					<img
						src={boardLight}
						alt={m.landing_feature_board_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:hidden"
					/>
					<img
						src={boardDark}
						alt={m.landing_feature_board_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="hidden h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:block"
					/>
				</div>
			</article>
			<article class="rounded-2xl border bg-card p-6 md:col-span-2">
				<span
					class="flex size-10 items-center justify-center rounded-lg bg-sunset-100 text-sunset-600 dark:bg-sunset-500/15 dark:text-sunset-300"
				>
					<CalendarDaysIcon class="size-5" />
				</span>
				<h3 class="mt-4 text-lg font-semibold tracking-tight">
					{m.landing_feature_calendar_title()}
				</h3>
				<p class="mt-1.5 text-sm text-muted-foreground">
					{m.landing_feature_calendar_description()}
				</p>
			</article>
			<article class="rounded-2xl border bg-card p-6 md:col-span-2">
				<span
					class="flex size-10 items-center justify-center rounded-lg bg-sunset-100 text-sunset-600 dark:bg-sunset-500/15 dark:text-sunset-300"
				>
					<BellRingIcon class="size-5" />
				</span>
				<h3 class="mt-4 text-lg font-semibold tracking-tight">
					{m.landing_feature_notifications_title()}
				</h3>
				<p class="mt-1.5 text-sm text-muted-foreground">
					{m.landing_feature_notifications_description()}
				</p>
			</article>
			<article class="flex flex-col overflow-hidden rounded-2xl border bg-card md:col-span-3">
				<div class="p-6 pb-4">
					<h3 class="text-lg font-semibold tracking-tight">{m.landing_feature_sharing_title()}</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">
						{m.landing_feature_sharing_description()}
					</p>
				</div>
				<div class="mt-auto h-64 pl-6">
					<img
						src={sharingLight}
						alt={m.landing_feature_sharing_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:hidden"
					/>
					<img
						src={sharingDark}
						alt={m.landing_feature_sharing_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="hidden h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:block"
					/>
				</div>
			</article>
		</div>
	</div>
</section>
```

- [ ] **Step 2: Wire into `src/routes/+page.svelte`**

Add to the script block (keep imports alphabetized):

```svelte
import LandingFeatures from '$lib/components/landing/landing-features.svelte';
```

And in the markup:

```svelte
<main class="flex-1">
	<LandingHero />
	<LandingFeatures />
</main>
```

- [ ] **Step 3: Autofix, typecheck, verify in browser** — autofixer clean, `pnpm check` 0 errors; on `/` confirm the 3/2 + 2/3 bento layout at desktop width, single column on mobile (resize to 375px), screenshots cropped from their top-left with rounded inset corners.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec prettier --write src/lib/components/landing/landing-features.svelte src/routes/+page.svelte
git add src/lib/components/landing/landing-features.svelte src/routes/+page.svelte
git commit -m "feat: landing features bento grid"
```

---

### Task 7: How-it-works + FAQ

**Files:**
- Create: `src/lib/components/landing/landing-how-it-works.svelte`
- Create: `src/lib/components/landing/landing-faq.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `m.landing_how_*`, `m.landing_faq_*` (Task 2); `ui/accordion`.
- Produces: section ids `how-it-works` and `faq` (nav/footer link targets).

- [ ] **Step 1: Create `src/lib/components/landing/landing-how-it-works.svelte`**

```svelte
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	const steps = [
		{ number: 1, title: m.landing_how_step1_title, description: m.landing_how_step1_description },
		{ number: 2, title: m.landing_how_step2_title, description: m.landing_how_step2_description },
		{ number: 3, title: m.landing_how_step3_title, description: m.landing_how_step3_description }
	];
</script>

<section id="how-it-works" class="scroll-mt-20 bg-sunset-50 px-4 py-20 sm:px-6 dark:bg-sunset-500/5">
	<div class="mx-auto max-w-6xl">
		<h2 class="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">
			{m.landing_how_title()}
		</h2>
		<ol class="mx-auto mt-12 grid max-w-4xl gap-10 md:grid-cols-3">
			{#each steps as step (step.number)}
				<li>
					<span
						class="flex size-8 items-center justify-center rounded-full bg-sunset-500 text-sm font-bold text-white"
					>
						{step.number}
					</span>
					<h3 class="mt-4 font-semibold tracking-tight">{step.title()}</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">{step.description()}</p>
				</li>
			{/each}
		</ol>
	</div>
</section>
```

- [ ] **Step 2: Create `src/lib/components/landing/landing-faq.svelte`**

```svelte
<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import { m } from '$lib/paraglide/messages.js';

	const items = [
		{ id: 'free', question: m.landing_faq_free_question, answer: m.landing_faq_free_answer },
		{ id: 'edit', question: m.landing_faq_edit_question, answer: m.landing_faq_edit_answer },
		{
			id: 'sharing',
			question: m.landing_faq_sharing_question,
			answer: m.landing_faq_sharing_answer
		},
		{
			id: 'languages',
			question: m.landing_faq_languages_question,
			answer: m.landing_faq_languages_answer
		}
	];
</script>

<section id="faq" class="scroll-mt-20 px-4 py-20 sm:px-6">
	<div class="mx-auto max-w-2xl">
		<h2 class="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">
			{m.landing_faq_title()}
		</h2>
		<Accordion.Root type="single" class="mt-8">
			{#each items as item (item.id)}
				<Accordion.Item value={item.id}>
					<Accordion.Trigger>{item.question()}</Accordion.Trigger>
					<Accordion.Content>{item.answer()}</Accordion.Content>
				</Accordion.Item>
			{/each}
		</Accordion.Root>
	</div>
</section>
```

- [ ] **Step 3: Wire into `src/routes/+page.svelte`**

Add to the script block (keep imports alphabetized):

```svelte
import LandingFaq from '$lib/components/landing/landing-faq.svelte';
import LandingHowItWorks from '$lib/components/landing/landing-how-it-works.svelte';
```

And in the markup:

```svelte
<main class="flex-1">
	<LandingHero />
	<LandingFeatures />
	<LandingHowItWorks />
	<LandingFaq />
</main>
```

- [ ] **Step 4: Autofix, typecheck, verify in browser** — autofixer clean; `pnpm check` 0 errors; on `/` confirm the sand-tinted how-it-works band, the three numbered steps, and that each FAQ item expands/collapses. Click the nav "How it works" link and confirm it scrolls to the section without hiding the heading under the sticky nav.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write src/lib/components/landing src/routes/+page.svelte
git add src/lib/components/landing src/routes/+page.svelte
git commit -m "feat: landing how-it-works and FAQ sections"
```

---

### Task 8: Final CTA panel

**Files:**
- Create: `src/lib/components/landing/landing-cta.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `m.landing_cta_*` (Task 2).

- [ ] **Step 1: Create `src/lib/components/landing/landing-cta.svelte`**

```svelte
<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
</script>

<section class="px-4 py-20 sm:px-6">
	<div
		class="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-linear-to-br from-sunset-400 via-sunset-500 to-sunset-700 px-6 py-16 text-center sm:py-24"
	>
		<div
			aria-hidden="true"
			class="absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-sunset-200/40 blur-3xl"
		></div>
		<h2
			class="relative mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-white sm:text-5xl"
		>
			{m.landing_cta_title()}
		</h2>
		<p class="relative mt-4 text-lg text-white/80">{m.landing_cta_subtitle()}</p>
		<Button
			size="lg"
			href={resolve('/signup' as Pathname)}
			class="relative mt-8 bg-white text-sunset-700 hover:bg-white/90"
		>
			{m.landing_cta_button()}
		</Button>
	</div>
</section>
```

- [ ] **Step 2: Wire into `src/routes/+page.svelte`**

The finished file:

```svelte
<script lang="ts">
	import LandingCta from '$lib/components/landing/landing-cta.svelte';
	import LandingFaq from '$lib/components/landing/landing-faq.svelte';
	import LandingFeatures from '$lib/components/landing/landing-features.svelte';
	import LandingFooter from '$lib/components/landing/landing-footer.svelte';
	import LandingHero from '$lib/components/landing/landing-hero.svelte';
	import LandingHowItWorks from '$lib/components/landing/landing-how-it-works.svelte';
	import LandingNav from '$lib/components/landing/landing-nav.svelte';
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.app_name()} · {m.landing_meta_title()}</title>
	<meta name="description" content={m.landing_meta_description()} />
</svelte:head>

<div class="flex min-h-svh flex-col">
	<LandingNav />
	<main class="flex-1">
		<LandingHero />
		<LandingFeatures />
		<LandingHowItWorks />
		<LandingFaq />
		<LandingCta />
	</main>
	<LandingFooter />
</div>
```

- [ ] **Step 3: Autofix, typecheck, verify in browser** — autofixer clean; `pnpm check` 0 errors; confirm the gradient panel reads well in light and dark mode and the white button is legible.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec prettier --write src/lib/components/landing/landing-cta.svelte src/routes/+page.svelte
git add src/lib/components/landing/landing-cta.svelte src/routes/+page.svelte
git commit -m "feat: landing closing CTA panel"
```

---

### Task 9: Full verification sweep

**Files:** none created — verification and fixes only.

- [ ] **Step 1: Quality gates**

Run each; all must pass:

```bash
pnpm test        # includes the Task 1 redirect tests
pnpm check       # 0 errors, 0 warnings
pnpm lint        # prettier + eslint clean
```

- [ ] **Step 2: Behavior checks in the browser (dev server running)**

1. Logged out, `GET /` → landing page renders (no redirect).
2. Log in as `dash-tester@example.com` / `dash-tester-pass-123`, visit `/` → lands on `/app`.
3. Log out again for the remaining checks.

- [ ] **Step 3: Visual checks**

Using the browser preview tools on `/` (logged out):
1. Desktop 1280px light: full-page pass — hero glow sits behind the screenshot, bento aligned, FAQ opens.
2. Dark mode: dark screenshots swap in (`dark:hidden` pairs), chip/gradients legible.
3. Mobile 375px: no horizontal scroll, nav collapses to logo + buttons, bento stacks.
4. All three anchor links scroll correctly under the sticky nav.
5. Take final screenshots (desktop light, desktop dark, mobile) to include in the summary for the user.

- [ ] **Step 4: Fix anything found, re-run the failing gate, and commit fixes**

Commit message style: `fix: <what>` — never add a Co-Authored-By trailer.

- [ ] **Step 5: Done**

Report completion with the final screenshots. Branch `feat/landing-page` is ready for the finishing-a-development-branch flow (merge/PR decision belongs to the user).
