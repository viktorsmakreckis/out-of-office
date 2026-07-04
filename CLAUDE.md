## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, tailwindcss, sveltekit-adapter, drizzle, better-auth, paraglide, mcp

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

---

## Project Guidelines

You must follow these whenever working on the project and making relevant edits:

- Use /karpathy-guidelines skill when writing code;
- Use shadcn-svelte UI components where possible;
- Do NOT co-author commits;

---

## Database workflow

Apply schema changes with **`pnpm db:generate` → commit the generated migration → `pnpm db:migrate`**.

Do **not** use `drizzle-kit push`. On the pinned drizzle-kit (0.31.x, the latest stable) its live-database introspection does not round-trip `nullsNotDistinct` unique constraints (`calendar_share_unique`, `calendar_feed_token_owner_unique`), so `push` perpetually proposes to recreate them — surfacing a spurious "do you want to truncate?" prompt — even when the schema is unchanged. It also does not record applied migrations in `drizzle.__drizzle_migrations`, which desyncs the migration ledger against `db:migrate`. Known upstream bug (drizzle-orm#4789, fixed only in the drizzle-kit 1.0 line). The `db:push` script has been removed for this reason; `db:generate`/`db:migrate` are unaffected because they replay committed SQL rather than introspecting.
