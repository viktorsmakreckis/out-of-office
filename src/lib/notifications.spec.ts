import { describe, expect, it } from 'vitest';
import { toAppNotification } from './notifications';

describe('toAppNotification', () => {
	it('maps an event_deleted row to the discriminated view', () => {
		const row = {
			id: 'n1',
			actorName: 'Alice',
			readAt: null,
			createdAt: new Date('2026-07-03T00:00:00Z'),
			type: 'event_deleted',
			data: { eventTitle: 'Trip', eventType: 'vacation' }
		};
		const result = toAppNotification(row);
		expect(result.type).toBe('event_deleted');
		expect(result.data).toEqual({ eventTitle: 'Trip', eventType: 'vacation' });
	});
});
