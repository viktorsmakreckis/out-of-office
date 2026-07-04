export type WeekBounds = {
	weekStart: Date;
	weekEndExclusive: Date;
	weekKey: string;
	weekLabel: string;
};

/** Wall-clock parts of `date` in `tz`, all numeric. */
function zonedParts(date: Date, tz: string) {
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
	return {
		year: Number(p.year),
		month: Number(p.month),
		day: Number(p.day),
		hour: Number(p.hour),
		minute: Number(p.minute),
		second: Number(p.second)
	};
}

/** Milliseconds east of UTC for `tz` at instant `date`. */
function tzOffsetMs(date: Date, tz: string): number {
	const p = zonedParts(date, tz);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return asUtc - date.getTime();
}

/** The UTC instant of a wall-clock date/time in `tz` (DST-safe via a refine pass). */
function zonedToUtc(y: number, m: number, d: number, hour: number, tz: string): Date {
	const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
	const off1 = tzOffsetMs(new Date(guess), tz);
	let instant = guess - off1;
	const off2 = tzOffsetMs(new Date(instant), tz);
	if (off2 !== off1) instant = guess - off2;
	return new Date(instant);
}

/** ISO weekday 1–7 (Mon=1) of a local calendar date. */
function isoWeekday(y: number, m: number, d: number): number {
	const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return day === 0 ? 7 : day;
}

/** ISO week key ("2026-W28") for a Monday local date. */
function isoWeekKey(y: number, m: number, d: number): string {
	const date = new Date(Date.UTC(y, m - 1, d));
	const day = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - day); // Thursday of this ISO week
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * The Mon–Sun ISO week containing `now`, expressed in `tz`. weekStart / weekEnd
 * are UTC instants for Monday 00:00 local and the following Monday 00:00 local.
 */
export function zonedWeekBounds(now: Date, tz: string, locale: string): WeekBounds {
	const local = zonedParts(now, tz);
	const iso = isoWeekday(local.year, local.month, local.day);
	// Local calendar date of this week's Monday.
	const monday = new Date(Date.UTC(local.year, local.month - 1, local.day) - (iso - 1) * 86_400_000);
	const my = monday.getUTCFullYear();
	const mm = monday.getUTCMonth() + 1;
	const md = monday.getUTCDate();
	const sunday = new Date(monday.getTime() + 6 * 86_400_000);

	const weekStart = zonedToUtc(my, mm, md, 0, tz);
	const weekEndExclusive = zonedToUtc(
		sunday.getUTCFullYear(),
		sunday.getUTCMonth() + 1,
		sunday.getUTCDate() + 1,
		0,
		tz
	);

	const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: tz });
	const from = fmt.format(weekStart);
	const to = fmt.format(new Date(weekEndExclusive.getTime() - 12 * 3_600_000)); // Sunday noon-ish
	return {
		weekStart,
		weekEndExclusive,
		weekKey: isoWeekKey(my, mm, md),
		weekLabel: from === to ? from : `${from} – ${to}`
	};
}

/** All-day rows are end-inclusive by date → treated as [start, end+1day); timed as [start, end). */
export function overlapsWeek(
	event: { allDay: boolean; start: Date; end: Date },
	weekStart: Date,
	weekEndExclusive: Date
): boolean {
	const endExclusive = event.allDay ? new Date(event.end.getTime() + 86_400_000) : event.end;
	return event.start.getTime() < weekEndExclusive.getTime() && endExclusive.getTime() > weekStart.getTime();
}
