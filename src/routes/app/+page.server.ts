import { redirect } from '@sveltejs/kit';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { today } from '@internationalized/date';
import { safeTimezone } from '$lib/events';
import { db } from '$lib/server/db';
import { calendarEvent, user as userTable } from '$lib/server/db/schema';
import { getVisibleOwners } from '$lib/server/sharing';
import { BOARD_DAYS } from './home';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const user = locals.user;
	const timezone = safeTimezone(user.timezone);
	const date = today(timezone);
	const owners = await getVisibleOwners(user.id);
	// One day of slack on each side: all-day rows live at UTC midnight while timed
	// rows are in the user's timezone; the client maps and filters precisely.
	const windowStart = date.subtract({ days: 1 }).toDate(timezone);
	const windowEnd = date.add({ days: BOARD_DAYS + 1 }).toDate(timezone);
	const eventColumns = {
		id: calendarEvent.id,
		type: calendarEvent.type,
		title: calendarEvent.title,
		allDay: calendarEvent.allDay,
		start: calendarEvent.start,
		end: calendarEvent.end
	};
	const [records, upcoming] = await Promise.all([
		db
			.select({ ...eventColumns, ownerId: calendarEvent.userId, ownerName: userTable.name })
			.from(calendarEvent)
			.innerJoin(userTable, eq(calendarEvent.userId, userTable.id))
			.where(
				and(
					inArray(calendarEvent.userId, [user.id, ...owners.map((owner) => owner.id)]),
					lt(calendarEvent.start, windowEnd),
					gte(calendarEvent.end, windowStart)
				)
			)
			.orderBy(asc(calendarEvent.start)),
		db
			.select(eventColumns)
			.from(calendarEvent)
			.where(and(eq(calendarEvent.userId, user.id), gte(calendarEvent.end, windowStart)))
			.orderBy(asc(calendarEvent.start))
			.limit(5)
	]);
	return { today: date.toString(), records, upcoming, hasConnections: owners.length > 0 };
};
