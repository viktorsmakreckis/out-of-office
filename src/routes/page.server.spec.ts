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
