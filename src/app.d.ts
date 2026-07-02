import type { AuthSession } from '$lib/server/auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: AuthSession['user'];
			session?: AuthSession['session'];
		}

		interface PageData {
			flash?: {
				type?: 'success' | 'error' | 'info' | 'warning' | 'loading' | 'message';
				message: string;
				description?: string;
			};
		}

		// interface Error {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
