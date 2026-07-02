import { startOfMonth, startOfWeek, type CalendarDate } from '@internationalized/date';

export const WEEKS_IN_GRID = 6;
export const DAYS_IN_WEEK = 7;

/** 6 rows × 7 days covering the focal month; a fixed 6 rows keeps the layout height stable. */
export function monthGrid(focal: CalendarDate, locale: string): CalendarDate[][] {
	const first = startOfWeek(startOfMonth(focal), locale);
	return Array.from({ length: WEEKS_IN_GRID }, (_, week) =>
		Array.from({ length: DAYS_IN_WEEK }, (_, day) => first.add({ days: week * DAYS_IN_WEEK + day }))
	);
}

/** The 7 days of the focal date's week, starting per locale. */
export function weekDays(focal: CalendarDate, locale: string): CalendarDate[] {
	const first = startOfWeek(focal, locale);
	return Array.from({ length: DAYS_IN_WEEK }, (_, day) => first.add({ days: day }));
}
