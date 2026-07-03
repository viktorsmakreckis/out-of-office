<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import BellIcon from '@lucide/svelte/icons/bell';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { m } from '$lib/paraglide/messages.js';

	let { data, children } = $props();
</script>

<Sidebar.Provider>
	<AppSidebar user={data.user} />
	<Sidebar.Inset>
		<header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
			<Sidebar.Trigger />
			<Button
				variant="ghost"
				size="icon"
				href={resolve('/app/notifications' as Pathname)}
				aria-label={m.notifications_bell_label()}
				class="relative"
			>
				<BellIcon />
				{#if data.unreadCount > 0}
					<Badge
						variant="destructive"
						class="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px]"
					>
						{data.unreadCount}
					</Badge>
				{/if}
			</Button>
		</header>
		<div class="mx-auto w-full max-w-5xl flex-1 p-4">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

<form
	id="signout-form"
	method="POST"
	action={resolve('/app/signout' as Pathname)}
	class="hidden"
></form>
