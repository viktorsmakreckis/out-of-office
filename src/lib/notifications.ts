/**
 * Discriminated read-side view of a notification row: narrows `data` by `type` so
 * per-type field access (e.g. `data.teamName` only for `team_invite`) is compile-checked.
 * See `NotificationData` in `$lib/server/db/schema` for the write-side payload union.
 */
export type AppNotification = {
	id: string;
	actorName: string;
	readAt: Date | null;
	createdAt: Date;
} & (
	| { type: 'team_invite'; data: { invitationId: string; teamName: string } }
	| { type: 'calendar_shared'; data: { shareId: string } }
	| {
			type: 'event_created' | 'event_updated' | 'event_deleted';
			data: { eventTitle: string | null; eventType: string };
	  }
);

type NotificationRow = {
	id: string;
	actorName: string;
	readAt: Date | null;
	createdAt: Date;
	type: string;
	data: unknown;
};

/** Converts a raw notification row to its discriminated view, tolerating missing fields. */
export function toAppNotification(row: NotificationRow): AppNotification {
	const data = (row.data ?? {}) as Record<string, unknown>;
	const base = {
		id: row.id,
		actorName: row.actorName,
		readAt: row.readAt,
		createdAt: row.createdAt
	};
	switch (row.type) {
		case 'team_invite':
			return {
				...base,
				type: 'team_invite',
				data: {
					invitationId: typeof data.invitationId === 'string' ? data.invitationId : '',
					teamName: typeof data.teamName === 'string' ? data.teamName : ''
				}
			};
		case 'calendar_shared':
			return {
				...base,
				type: 'calendar_shared',
				data: { shareId: typeof data.shareId === 'string' ? data.shareId : '' }
			};
		case 'event_created':
		case 'event_updated':
		case 'event_deleted':
			return {
				...base,
				type: row.type,
				data: {
					eventTitle: typeof data.eventTitle === 'string' ? data.eventTitle : null,
					eventType: typeof data.eventType === 'string' ? data.eventType : ''
				}
			};
		default:
			// Unknown type: render as an event-change entry with placeholder data — the page
			// already guards these fields being empty/missing.
			return { ...base, type: 'event_updated', data: { eventTitle: null, eventType: '' } };
	}
}
