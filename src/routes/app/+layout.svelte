<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, type Locale } from '$lib/paraglide/runtime';

	let { data, children } = $props();

	// Endonyms are intentionally not translated.
	const localeLabels: Record<Locale, string> = { en: 'English', pl: 'Polski', fr: 'Français' };
	// setLocale() reloads the page, so the current locale is stable per render.
	const currentLocale = getLocale();

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
						<NavigationMenu.Link href={resolve('/app')}>{m.nav_home()}</NavigationMenu.Link>
					</NavigationMenu.Item>
					<NavigationMenu.Item>
						<NavigationMenu.Link href={resolve('/app/calendar')}>
							{m.nav_calendar()}
						</NavigationMenu.Link>
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
							<span class="line-clamp-1 text-wrap wrap-anywhere" title={data.user.name}>
								{data.user.name}
							</span>
							<span class="line-clamp-1 text-wrap wrap-anywhere" title={data.user.email}>
								{data.user.email}
							</span>
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
							<DropdownMenu.CheckboxItem
								checked={userPrefersMode.current === 'light'}
								onSelect={() => setMode('light')}
							>
								{m.theme_light()}
							</DropdownMenu.CheckboxItem>
							<DropdownMenu.CheckboxItem
								checked={userPrefersMode.current === 'dark'}
								onSelect={() => setMode('dark')}
							>
								{m.theme_dark()}
							</DropdownMenu.CheckboxItem>
							<DropdownMenu.CheckboxItem
								checked={userPrefersMode.current === 'system'}
								onSelect={() => setMode('system')}
							>
								{m.theme_system()}
							</DropdownMenu.CheckboxItem>
						</DropdownMenu.SubContent>
					</DropdownMenu.Sub>
					<DropdownMenu.Sub>
						<DropdownMenu.SubTrigger>{m.menu_language()}</DropdownMenu.SubTrigger>
						<DropdownMenu.SubContent>
							{#each locales as locale (locale)}
								<DropdownMenu.CheckboxItem
									checked={locale === currentLocale}
									onSelect={() => setLocale(locale)}
								>
									{localeLabels[locale]}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.SubContent>
					</DropdownMenu.Sub>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" class="w-full">
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

<form
	id="signout-form"
	method="POST"
	action={resolve('/app/signout' as Pathname)}
	class="hidden"
></form>
