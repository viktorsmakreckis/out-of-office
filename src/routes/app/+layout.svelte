<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import { setMode } from 'mode-watcher';
	import { m } from '$lib/paraglide/messages.js';
	import { locales, setLocale, type Locale } from '$lib/paraglide/runtime';

	let { data, children } = $props();

	// Endonyms are intentionally not translated.
	const localeLabels: Record<Locale, string> = { en: 'English', pl: 'Polski', fr: 'Français' };

	const initials = $derived(
		data.user.name
			.split(' ')
			.map((part: string) => part[0] ?? '')
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
</script>

<div class="flex min-h-svh flex-col">
	<header class="border-b">
		<div class="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-2">
			<NavigationMenu.Root>
				<NavigationMenu.List>
					<NavigationMenu.Item>
						<NavigationMenu.Link href="/app">{m.nav_home()}</NavigationMenu.Link>
					</NavigationMenu.Item>
				</NavigationMenu.List>
			</NavigationMenu.Root>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon" class="rounded-full">
							<Avatar.Root>
								<Avatar.Fallback>{initials}</Avatar.Fallback>
							</Avatar.Root>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-56">
					<DropdownMenu.Label>
						<div class="grid">
							<span>{data.user.name}</span>
							<span class="text-xs font-normal text-muted-foreground">{data.user.email}</span>
						</div>
					</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a href={resolve('/app/settings' as Pathname)} {...props}>{m.menu_settings()}</a>
						{/snippet}
					</DropdownMenu.Item>
					<DropdownMenu.Sub>
						<DropdownMenu.SubTrigger>{m.menu_theme()}</DropdownMenu.SubTrigger>
						<DropdownMenu.SubContent>
							<DropdownMenu.Item onSelect={() => setMode('light')}>
								{m.theme_light()}
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => setMode('dark')}>
								{m.theme_dark()}
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => setMode('system')}>
								{m.theme_system()}
							</DropdownMenu.Item>
						</DropdownMenu.SubContent>
					</DropdownMenu.Sub>
					<DropdownMenu.Sub>
						<DropdownMenu.SubTrigger>{m.menu_language()}</DropdownMenu.SubTrigger>
						<DropdownMenu.SubContent>
							{#each locales as locale (locale)}
								<DropdownMenu.Item onSelect={() => setLocale(locale)}>
									{localeLabels[locale]}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.SubContent>
					</DropdownMenu.Sub>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive">
						{#snippet child({ props })}
							<button {...props} type="submit" form="signout-form">
								{m.menu_sign_out()}
							</button>
						{/snippet}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>
	<main class="mx-auto w-full max-w-5xl flex-1 p-4">
		{@render children()}
	</main>
</div>

<form id="signout-form" method="POST" action="/app/signout" class="hidden"></form>
