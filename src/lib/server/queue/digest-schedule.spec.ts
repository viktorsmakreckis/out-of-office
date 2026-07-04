import { describe, expect, it } from 'vitest';
import { removeDigestSchedule, upsertDigestSchedule } from './digest-schedule';

describe('digest schedule (no Redis configured)', () => {
	it('upsert is a no-op that resolves', async () => {
		await expect(
			upsertDigestSchedule({ orgId: 'o1', weekday: 1, hour: 8, timezone: 'UTC' })
		).resolves.toBeUndefined();
	});

	it('remove is a no-op that resolves', async () => {
		await expect(removeDigestSchedule('o1')).resolves.toBeUndefined();
	});
});
