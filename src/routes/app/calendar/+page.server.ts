import { error, fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { parseDate, today, type CalendarDate } from '@internationalized/date';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { CalendarView } from '$lib/components/calendar';
import { changeRangeToInstants, formValuesToRange, safeTimezone } from '$lib/events';
import { m } from '$lib/paraglide/messages.js';
import { deleteEventSchema, eventSchema, moveEventSchema } from '$lib/schemas/event';
import { db } from '$lib/server/db';
import { calendarEvent } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const VIEWS: readonly CalendarView[] = ['month', 'week', 'agenda'];

/** view/date come from query params so calendar state survives the POST/redirect cycle. */
function calendarState(url: URL, timezone: string): { view: CalendarView; date: CalendarDate } {
	const viewParam = url.searchParams.get('view') as CalendarView | null;
	const view: CalendarView = viewParam && VIEWS.includes(viewParam) ? viewParam : 'month';
	let date: CalendarDate;
	try {
		date = parseDate(url.searchParams.get('date') ?? '');
	} catch {
		date = today(safeTimezone(timezone));
	}
	return { view, date };
}

function calendarPath(url: URL, timezone: string): string {
	const { view, date } = calendarState(url, timezone);
	return `/app/calendar?view=${view}&date=${date.toString()}`;
}

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const { view, date } = calendarState(url, user.timezone);
	const [records, eventForm, deleteForm, moveForm] = await Promise.all([
		db
			.select({
				id: calendarEvent.id,
				type: calendarEvent.type,
				title: calendarEvent.title,
				allDay: calendarEvent.allDay,
				start: calendarEvent.start,
				end: calendarEvent.end
			})
			.from(calendarEvent)
			.where(eq(calendarEvent.userId, user.id))
			.orderBy(asc(calendarEvent.start)),
		superValidate(zod4(eventSchema), { id: 'event' }),
		superValidate(zod4(deleteEventSchema), { id: 'delete' }),
		superValidate(zod4(moveEventSchema), { id: 'move' })
	]);
	return { view, date: date.toString(), records, eventForm, deleteForm, moveForm };
};

export const actions: Actions = {
	save: async (event) => {
		const form = await superValidate(event.request, zod4(eventSchema), { id: 'event' });
		if (!form.valid) return fail(400, { form });
		const user = requireUser(event.locals);

		const range = formValuesToRange(form.data, user.timezone);
		const values = {
			type: form.data.type,
			title: form.data.title === '' ? null : form.data.title,
			allDay: form.data.allDay,
			start: range.start,
			end: range.end
		};

		let message: string;
		if (form.data.id === '') {
			await db.insert(calendarEvent).values({ ...values, userId: user.id });
			message = m.calendar_event_created();
		} else {
			const updated = await db
				.update(calendarEvent)
				.set(values)
				.where(and(eq(calendarEvent.id, form.data.id), eq(calendarEvent.userId, user.id)))
				.returning({ id: calendarEvent.id });
			if (updated.length === 0) error(404);
			message = m.calendar_event_updated();
		}
		redirect(303, calendarPath(event.url, user.timezone), { type: 'success', message }, event);
	},
	delete: async (event) => {
		const form = await superValidate(event.request, zod4(deleteEventSchema), { id: 'delete' });
		if (!form.valid) return fail(400, { form });
		const user = requireUser(event.locals);

		const deleted = await db
			.delete(calendarEvent)
			.where(and(eq(calendarEvent.id, form.data.id), eq(calendarEvent.userId, user.id)))
			.returning({ id: calendarEvent.id });
		if (deleted.length === 0) error(404);

		redirect(
			303,
			calendarPath(event.url, user.timezone),
			{ type: 'success', message: m.calendar_event_deleted() },
			event
		);
	},
	move: async (event) => {
		const form = await superValidate(event.request, zod4(moveEventSchema), { id: 'move' });
		if (!form.valid) return fail(400, { form });
		const user = requireUser(event.locals);

		const range = changeRangeToInstants(form.data, user.timezone);
		const updated = await db
			.update(calendarEvent)
			.set({ allDay: form.data.allDay, start: range.start, end: range.end })
			.where(and(eq(calendarEvent.id, form.data.id), eq(calendarEvent.userId, user.id)))
			.returning({ id: calendarEvent.id });
		if (updated.length === 0) error(404);

		redirect(
			303,
			calendarPath(event.url, user.timezone),
			{ type: 'success', message: m.calendar_event_moved() },
			event
		);
	}
};
