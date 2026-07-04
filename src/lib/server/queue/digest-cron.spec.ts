import { describe, expect, it } from 'vitest';
import { digestCronPattern, digestSchedulerId } from './digest-cron';

describe('digestSchedulerId', () => {
	it('namespaces by org id', () => {
		expect(digestSchedulerId('org_123')).toBe('digest:org_123');
	});
});

describe('digestCronPattern', () => {
	it('maps ISO Monday to cron dow 1 at the given hour', () => {
		expect(digestCronPattern(1, 8)).toBe('0 8 * * 1');
	});

	it('maps ISO Sunday (7) to cron dow 0', () => {
		expect(digestCronPattern(7, 9)).toBe('0 9 * * 0');
	});

	it('maps ISO Friday to cron dow 5', () => {
		expect(digestCronPattern(5, 0)).toBe('0 0 * * 5');
	});
});
