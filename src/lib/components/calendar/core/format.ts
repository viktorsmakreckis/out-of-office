import type { CalendarDate, CalendarDateTime } from '@internationalized/date';

// CalendarDate.toDate('UTC') is a UTC-midnight instant; formatting must stay in UTC
// or the rendered date would shift in western timezones.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let cached = formatterCache.get(key);
	if (!cached) {
		cached = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
		formatterCache.set(key, cached);
	}
	return cached;
}

export function formatMonthLabel(date: CalendarDate, locale: string): string {
	return formatter(locale, { month: 'long', year: 'numeric' }).format(date.toDate('UTC'));
}

export function formatWeekLabel(start: CalendarDate, end: CalendarDate, locale: string): string {
	return formatter(locale, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
		start.toDate('UTC'),
		end.toDate('UTC')
	);
}

export function formatWeekdayName(
	date: CalendarDate,
	locale: string,
	width: 'short' | 'long' = 'short'
): string {
	return formatter(locale, { weekday: width }).format(date.toDate('UTC'));
}

export function formatDayHeading(date: CalendarDate, locale: string): string {
	return formatter(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
		date.toDate('UTC')
	);
}

export function formatTime(time: CalendarDateTime, locale: string): string {
	return formatter(locale, { hour: 'numeric', minute: '2-digit' }).format(time.toDate('UTC'));
}

export function formatTimeRange(
	start: CalendarDateTime,
	end: CalendarDateTime,
	locale: string
): string {
	return formatter(locale, { hour: 'numeric', minute: '2-digit' }).formatRange(
		start.toDate('UTC'),
		end.toDate('UTC')
	);
}

export function formatHourLabel(hour: number, locale: string): string {
	return formatter(locale, { hour: 'numeric' }).format(Date.UTC(2000, 0, 1, hour));
}
