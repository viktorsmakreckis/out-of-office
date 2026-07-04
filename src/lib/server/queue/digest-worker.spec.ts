import { describe, expect, it } from 'vitest';
import { startDigestWorker } from './digest-worker';

describe('startDigestWorker (no Redis configured)', () => {
	it('is a no-op that does not throw', () => {
		expect(() => startDigestWorker()).not.toThrow();
	});
});
