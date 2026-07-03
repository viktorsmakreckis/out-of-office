import { eventTypeLabelFor } from '$lib/events/labels';
import { baseLocale } from '$lib/paraglide/runtime';

export type FeedEvent = {
	id: string;
	userName: string;
	type: string;
	title: string | null;
	allDay: boolean;
	start: Date;
	end: Date;
	updatedAt: Date;
};

function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

const pad = (n: number) => String(n).padStart(2, '0');

function icalDate(date: Date): string {
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function icalDateTime(date: Date): string {
	return `${icalDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 86_400_000);
}

const textEncoder = new TextEncoder();

/**
 * RFC 5545 §3.1 line folding: no physical line may exceed 75 octets (UTF-8
 * bytes), and continuation lines start with a single space (which itself
 * counts as 1 octet toward that line's budget). Folding must never split a
 * Unicode code point, so we iterate code points (not UTF-16 code units) and
 * measure each one's UTF-8 byte length.
 */
function foldLine(line: string): string {
	const parts: string[] = [];
	let current = '';
	let currentOctets = 0;

	for (const ch of line) {
		const chOctets = textEncoder.encode(ch).length;
		if (currentOctets + chOctets > 75) {
			parts.push(current);
			current = ' ';
			currentOctets = 1;
		}
		current += ch;
		currentOctets += chOctets;
	}
	parts.push(current);

	return parts.join('\r\n');
}

/**
 * Read-only VCALENDAR for a set of events. All-day rows are stored
 * end-inclusive by date part, so DTEND (exclusive per RFC 5545) is end + 1 day.
 */
export function buildIcalFeed(calendarName: string, events: FeedEvent[]): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//out-of-office//EN',
		`X-WR-CALNAME:${escapeText(calendarName)}`
	];
	for (const event of events) {
		const typeLabel = eventTypeLabelFor(event.type, baseLocale);
		const summary = event.title
			? `${event.userName} — ${typeLabel}: ${event.title}`
			: `${event.userName} — ${typeLabel}`;
		lines.push(
			'BEGIN:VEVENT',
			`UID:${event.id}@out-of-office`,
			`DTSTAMP:${icalDateTime(event.updatedAt)}`,
			`SUMMARY:${escapeText(summary)}`
		);
		if (event.allDay) {
			lines.push(
				`DTSTART;VALUE=DATE:${icalDate(event.start)}`,
				`DTEND;VALUE=DATE:${icalDate(addDays(event.end, 1))}`
			);
		} else {
			lines.push(`DTSTART:${icalDateTime(event.start)}`, `DTEND:${icalDateTime(event.end)}`);
		}
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}
