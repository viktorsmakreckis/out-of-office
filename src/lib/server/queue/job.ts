export const QUEUE_NAME = 'notifications';

export type EventDeliveryPayload = {
	actorId: string;
	actorName: string;
	kind: 'created' | 'updated' | 'deleted';
	title: string | null;
	type: string;
	range: { allDay: boolean; start: Date; end: Date };
	emailRecipients: Array<{ email: string; locale: string }>;
};

export type EventDeliveryJobData = {
	actorId: string;
	actorName: string;
	kind: 'created' | 'updated' | 'deleted';
	title: string | null;
	type: string;
	range: { allDay: boolean; start: string; end: string };
	emailRecipients: Array<{ email: string; locale: string }>;
};

/** Dates don't survive JSON — flatten to ISO on the way into the queue. */
export function toEventDeliveryJob(p: EventDeliveryPayload): EventDeliveryJobData {
	return {
		...p,
		range: {
			allDay: p.range.allDay,
			start: p.range.start.toISOString(),
			end: p.range.end.toISOString()
		}
	};
}

/** Rehydrate ISO strings back to Dates on the way out of the queue. */
export function fromEventDeliveryJob(d: EventDeliveryJobData): EventDeliveryPayload {
	return {
		...d,
		range: {
			allDay: d.range.allDay,
			start: new Date(d.range.start),
			end: new Date(d.range.end)
		}
	};
}
