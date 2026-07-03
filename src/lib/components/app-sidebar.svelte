<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import HouseIcon from '@lucide/svelte/icons/house';
	import Share2Icon from '@lucide/svelte/icons/share-2';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, type Locale } from '$lib/paraglide/runtime';

	let { user }: { user: { name: string; email: string } } = $props();

	const sidebar = useSidebar();

	// Endonyms are intentionally not translated.
	const localeLabels: Record<Locale, string> = { en: 'English', pl: 'Polski', fr: 'Français' };
	// setLocale() reloads the page, so the current locale is stable per render.
	const currentLocale = getLocale();

	const homeUrl = resolve('/app');
	const navItems = [
		{ label: m.nav_home, url: homeUrl, icon: HouseIcon },
		{ label: m.nav_calendar, url: resolve('/app/calendar'), icon: CalendarIcon },
		{ label: m.nav_teams, url: resolve('/app/teams' as Pathname), icon: UsersIcon },
		{ label: m.nav_sharing, url: resolve('/app/sharing' as Pathname), icon: Share2Icon }
	];

	const isActive = (url: string) =>
		page.url.pathname === url || (url !== homeUrl && page.url.pathname.startsWith(`${url}/`));

	const initials = $derived(
		user.name
			.split(' ')
			.map((part: string) => part[0] ?? '')
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);
</script>

<Sidebar.Root>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each navItems as item (item.url)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isActive(item.url)}>
								{#snippet child({ props })}
									<a href={item.url} {...props} onclick={() => sidebar.setOpenMobile(false)}>
										<item.icon />
										<span>{item.label()}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton
								{...props}
								size="lg"
								class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<Avatar.Root class="size-8">
									<Avatar.Fallback>{initials}</Avatar.Fallback>
								</Avatar.Root>
								<div class="grid flex-1 text-start text-sm leading-tight">
									<span class="truncate font-medium">{user.name}</span>
									<span class="text-muted-foreground truncate text-xs">{user.email}</span>
								</div>
								<EllipsisVerticalIcon class="ms-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						side={sidebar.isMobile ? 'bottom' : 'right'}
						align="end"
						class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
					>
						<DropdownMenu.Label class="p-0 font-normal">
							<div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
								<Avatar.Root class="size-8">
									<Avatar.Fallback>{initials}</Avatar.Fallback>
								</Avatar.Root>
								<div class="grid flex-1 leading-tight">
									<span class="truncate font-medium" title={user.name}>{user.name}</span>
									<span class="truncate text-xs text-muted-foreground" title={user.email}>
										{user.email}
									</span>
								</div>
							</div>
						</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
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
						</DropdownMenu.Group>
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
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>
