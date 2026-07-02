<script lang="ts">
	import { page } from '$app/state';
	import { getFlash } from 'sveltekit-flash-message';
	import { toast } from 'svelte-sonner';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	const flash = getFlash(page);

	$effect(() => {
		if (!$flash) return;

		const { type, message, description } = $flash;
		const options = description ? { description } : undefined;

		switch (type) {
			case 'success':
				toast.success(message, options);
				break;
			case 'error':
				toast.error(message, options);
				break;
			case 'info':
				toast.info(message, options);
				break;
			case 'warning':
				toast.warning(message, options);
				break;
			case 'loading':
				toast.loading(message, options);
				break;
			default:
				toast.message(message, options);
		}

		// Clear the flash message so it isn't shown again on the next effect run.
		$flash = undefined;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />
<Toaster />

{@render children()}
