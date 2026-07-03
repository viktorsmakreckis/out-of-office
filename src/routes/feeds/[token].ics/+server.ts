import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	calendarEvent,
	calendarFeedToken,
	member,
	organization,
	user
} from '$lib/server/db/schema';
import { buildIcalFeed, type FeedEvent } from '$lib/server/integrations/ical';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const [row] = await db
		.select()
		.from(calendarFeedToken)
		.where(eq(calendarFeedToken.token, params.token));
	if (!row) error(404);

	let calendarName: string;
	let userIds: string[];
	if (row.userId) {
		const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, row.userId));
		if (!owner) error(404);
		calendarName = owner.name;
		userIds = [row.userId];
	} else {
		const [org] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, row.orgId ?? ''));
		if (!org) error(404);
		const members = await db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, row.orgId ?? ''));
		calendarName = org.name;
		userIds = members.map((m) => m.userId);
	}

	const events: FeedEvent[] =
		userIds.length === 0
			? []
			: await db
					.select({
						id: calendarEvent.id,
						userName: user.name,
						type: calendarEvent.type,
						title: calendarEvent.title,
						allDay: calendarEvent.allDay,
						start: calendarEvent.start,
						end: calendarEvent.end,
						updatedAt: calendarEvent.updatedAt
					})
					.from(calendarEvent)
					.innerJoin(user, eq(calendarEvent.userId, user.id))
					.where(inArray(calendarEvent.userId, userIds));

	return new Response(buildIcalFeed(calendarName, events), {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
