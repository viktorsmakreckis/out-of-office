import { describe, expect, it, vi } from 'vitest';

// Mock via the same `$lib` specifiers notifications.ts imports, so Vitest
// intercepts the exact module instances the code under test uses.
vi.mock('$lib/server/email', () => ({
	sendEmail: vi.fn(),
	eventChangeEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' }))
}));
vi.mock('$lib/server/integrations/webhooks', () => ({
	postEventToTeamChannels: vi.fn(async () => {})
}));

import { sendEmail } from '$lib/server/email';
import { postEventToTeamChannels } from '$lib/server/integrations/webhooks';
import { deliverEventChange, eventNotificationType } from './notifications';
import type { EventDeliveryPayload } from './queue/job';

const payload: EventDeliveryPayload = {
	actorId: 'u1',
	actorName: 'Alice',
	kind: 'deleted',
	title: 'Trip',
	type: 'vacation',
	range: { allDay: true, start: new Date(), end: new Date() },
	emailRecipients: [
		{ email: 'a@x.test', locale: 'en-GB' },
		{ email: 'b@x.test', locale: 'fr' }
	]
};

describe('eventNotificationType', () => {
	it('maps kind to notification type', () => {
		expect(eventNotificationType('created')).toBe('event_created');
		expect(eventNotificationType('updated')).toBe('event_updated');
		expect(eventNotificationType('deleted')).toBe('event_deleted');
	});
});

describe('deliverEventChange', () => {
	it('is best-effort: a rejected email does not stop channel delivery', async () => {
		vi.mocked(sendEmail)
			.mockRejectedValueOnce(new Error('resend down'))
			.mockResolvedValueOnce(undefined);
		await expect(deliverEventChange(payload)).resolves.toBeUndefined();
		expect(sendEmail).toHaveBeenCalledTimes(2);
		expect(postEventToTeamChannels).toHaveBeenCalledWith(
			'u1',
			expect.objectContaining({ kind: 'deleted' })
		);
	});
});
