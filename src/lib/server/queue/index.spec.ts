import { describe, expect, it } from 'vitest';
import { enqueueEventDelivery } from './index';
import type { EventDeliveryPayload } from './job';

const payload: EventDeliveryPayload = {
	actorId: 'u1',
	actorName: 'Alice',
	kind: 'created',
	title: null,
	type: 'vacation',
	range: { allDay: true, start: new Date(), end: new Date() },
	emailRecipients: []
};

describe('enqueueEventDelivery', () => {
	it('is a no-op that resolves when REDIS_URL is not configured', async () => {
		// No REDIS_URL in the test env → getQueue() returns null → resolves without throwing.
		await expect(enqueueEventDelivery(payload)).resolves.toBeUndefined();
	});
});
