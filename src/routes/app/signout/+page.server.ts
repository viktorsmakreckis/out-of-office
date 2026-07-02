import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		try {
			await auth.api.signOut({ headers: request.headers });
		} catch {
			// Session already gone — proceed to login.
		}
		redirect(303, '/login');
	}
};
