import { describe, expect, it } from 'vitest';
import { fromEventDeliveryJob, toEventDeliveryJob, type EventDeliveryPayload } from './job';

const payload: EventDeliveryPayload = {
	actorId: 'u1',
	actorName: 'Alice',
	kind: 'deleted',
	title: 'Trip',
	type: 'vacation',
	range: {
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z')
	},
	emailRecipients: [{ email: 'bob@x.test', locale: 'fr' }]
};

describe('event delivery job serialization', () => {
	it('serializes range dates to ISO strings', () => {
		const data = toEventDeliveryJob(payload);
		expect(data.range.start).toBe('2026-07-06T00:00:00.000Z');
		expect(data.range.end).toBe('2026-07-08T00:00:00.000Z');
		expect(data.emailRecipients).toEqual([{ email: 'bob@x.test', locale: 'fr' }]);
	});

	it('round-trips back to Date instances', () => {
		const restored = fromEventDeliveryJob(toEventDeliveryJob(payload));
		expect(restored.range.start).toBeInstanceOf(Date);
		expect(restored.range.start.toISOString()).toBe(payload.range.start.toISOString());
		expect(restored).toEqual(payload);
	});
});
