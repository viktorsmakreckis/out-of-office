import {
	parseDate,
	parseDateTime,
	parseTime,
	toCalendarDateTime,
	type CalendarDate,
	type Time
} from '@internationalized/date';
import { z } from 'zod';
import { eventTypes } from '$lib/events';
import { m } from '$lib/paraglide/messages.js';

function tryParse<T>(parse: () => T): T | null {
	try {
		return parse();
	} catch {
		return null;
	}
}

const dateSchema = z.string().refine((value) => tryParse(() => parseDate(value)) !== null, {
	error: () => m.validation_event_date_invalid()
});

const timeSchema = z.string().refine((value) => tryParse(() => parseTime(value)) !== null, {
	error: () => m.validation_event_time_invalid()
});

export const eventSchema = z
	.object({
		id: z.string().default(''),
		type: z.enum(eventTypes, { error: () => m.validation_event_type_invalid() }),
		title: z.string().trim().max(200).default(''),
		allDay: z.boolean(),
		startDate: dateSchema,
		endDate: dateSchema,
		startTime: timeSchema.default('09:00'),
		endTime: timeSchema.default('17:00')
	})
	.check((ctx) => {
		const { type, title, allDay, startDate, endDate, startTime, endTime } = ctx.value;
		if (type === 'other' && title === '') {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_title_required(),
				path: ['title'],
				input: title
			});
		}
		const start = tryParse(() => parseDate(startDate));
		const end = tryParse(() => parseDate(endDate));
		if (!start || !end) return; // field-level refinements already reported
		if (allDay) {
			// All-day ranges are end-inclusive: start == end is a one-day event.
			if (end.compare(start) < 0) {
				ctx.issues.push({
					code: 'custom',
					message: m.validation_event_end_before_start(),
					path: ['endDate'],
					input: endDate
				});
			}
			return;
		}
		const startTimeOfDay = tryParse(() => parseTime(startTime));
		const endTimeOfDay = tryParse(() => parseTime(endTime));
		if (!startTimeOfDay || !endTimeOfDay) return;
		if (!timedEndIsAfterStart(start, startTimeOfDay, end, endTimeOfDay)) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_end_before_start(),
				path: ['endTime'],
				input: endTime
			});
		}
	});

// Timed ranges are end-exclusive, so the end must be strictly after the start.
function timedEndIsAfterStart(
	startDate: CalendarDate,
	startTime: Time,
	endDate: CalendarDate,
	endTime: Time
): boolean {
	return toCalendarDateTime(endDate, endTime).compare(toCalendarDateTime(startDate, startTime)) > 0;
}

export const deleteEventSchema = z.object({
	id: z.string().min(1)
});

export const moveEventSchema = z
	.object({
		id: z.string().min(1),
		allDay: z.boolean(),
		start: z.string(),
		end: z.string()
	})
	.check((ctx) => {
		const { allDay, start, end } = ctx.value;
		if (allDay) {
			const startDate = tryParse(() => parseDate(start));
			const endDate = tryParse(() => parseDate(end));
			if (!startDate || !endDate) {
				ctx.issues.push({
					code: 'custom',
					message: m.validation_event_date_invalid(),
					path: ['start'],
					input: start
				});
				return;
			}
			// For all-day, reject strings with time component (T indicates datetime)
			if (start.includes('T') || end.includes('T')) {
				ctx.issues.push({
					code: 'custom',
					message: m.validation_event_date_invalid(),
					path: ['start'],
					input: start
				});
				return;
			}
			if (endDate.compare(startDate) < 0) {
				ctx.issues.push({
					code: 'custom',
					message: m.validation_event_end_before_start(),
					path: ['end'],
					input: end
				});
			}
			return;
		}
		// For timed events, require T-format (datetime), reject date-only strings
		if (!start.includes('T') || !end.includes('T')) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_date_invalid(),
				path: ['start'],
				input: start
			});
			return;
		}
		const startDateTime = tryParse(() => parseDateTime(start));
		const endDateTime = tryParse(() => parseDateTime(end));
		if (!startDateTime || !endDateTime) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_date_invalid(),
				path: ['start'],
				input: start
			});
			return;
		}
		if (endDateTime.compare(startDateTime) <= 0) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_end_before_start(),
				path: ['end'],
				input: end
			});
		}
	});
