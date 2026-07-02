import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, like, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authRateLimit } from '$lib/server/db/schema';
import { checkRateLimit } from './rate-limit';

const prefix = `test:${crypto.randomUUID()}`;
const key = (name: string) => `${prefix}:${name}`;

beforeAll(async () => {
	// Fails fast with a clear message when the dev DB isn't up.
	await db.execute(sql`select 1`);
});

afterAll(async () => {
	await db.delete(authRateLimit).where(like(authRateLimit.key, `${prefix}:%`));
});

describe('checkRateLimit', () => {
	it('allows up to max attempts, then blocks', async () => {
		const rule = { key: key('block'), max: 3, windowSeconds: 60 };
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(false);
	});

	it('resets the counter after the window expires', async () => {
		const rule = { key: key('reset'), max: 1, windowSeconds: 60 };
		expect(await checkRateLimit(rule)).toBe(true);
		expect(await checkRateLimit(rule)).toBe(false);
		// Simulate window expiry instead of sleeping.
		await db
			.update(authRateLimit)
			.set({ resetAt: sql`now() - interval '1 second'` })
			.where(eq(authRateLimit.key, key('reset')));
		expect(await checkRateLimit(rule)).toBe(true);
	});

	it('blocks when any one of several rules is exceeded', async () => {
		const strict = { key: key('multi-strict'), max: 1, windowSeconds: 60 };
		const loose = { key: key('multi-loose'), max: 100, windowSeconds: 60 };
		expect(await checkRateLimit(strict, loose)).toBe(true);
		expect(await checkRateLimit(strict, loose)).toBe(false);
	});
});
