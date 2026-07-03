import { describe, expect, it } from 'vitest';
import { buildIcalFeed, type FeedEvent } from './ical';

function makeEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
	return {
		id: 'evt-1',
		userName: 'Alice',
		type: 'vacation',
		title: null,
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z'),
		updatedAt: new Date('2026-07-01T12:30:45Z'),
		...overrides
	};
}

describe('buildIcalFeed', () => {
	it('produces a VCALENDAR wrapper with CRLF line endings and the calendar name', () => {
		const feed = buildIcalFeed('Team Design', []);
		expect(feed.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(feed.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(feed).toContain('X-WR-CALNAME:Team Design');
	});

	it('maps all-day end-inclusive dates to an exclusive DTEND one day later', () => {
		const feed = buildIcalFeed('x', [makeEvent()]);
		expect(feed).toContain('DTSTART;VALUE=DATE:20260706');
		expect(feed).toContain('DTEND;VALUE=DATE:20260709');
	});

	it('maps timed events to UTC date-times', () => {
		const feed = buildIcalFeed('x', [
			makeEvent({
				allDay: false,
				start: new Date('2026-07-06T09:00:00Z'),
				end: new Date('2026-07-06T17:00:00Z')
			})
		]);
		expect(feed).toContain('DTSTART:20260706T090000Z');
		expect(feed).toContain('DTEND:20260706T170000Z');
	});

	it('builds the summary from name, type label, and optional title', () => {
		const withTitle = buildIcalFeed('x', [makeEvent({ title: 'Trip' })]);
		expect(withTitle).toContain('SUMMARY:Alice — Vacation: Trip');
		const withoutTitle = buildIcalFeed('x', [makeEvent()]);
		expect(withoutTitle).toContain('SUMMARY:Alice — Vacation');
	});

	it('escapes commas, semicolons, and newlines in text values', () => {
		const feed = buildIcalFeed('x', [makeEvent({ title: 'a,b;c\nd' })]);
		expect(feed).toContain('a\\,b\\;c\\nd');
	});

	it('includes UID and DTSTAMP per event', () => {
		const feed = buildIcalFeed('x', [makeEvent()]);
		expect(feed).toContain('UID:evt-1@out-of-office');
		expect(feed).toContain('DTSTAMP:20260701T123045Z');
	});

	it('folds lines longer than 74 characters, keeping every physical line within 75 octets', () => {
		const feed = buildIcalFeed('x', [makeEvent({ title: 'y'.repeat(120) })]);
		for (const line of feed.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
	});

	it('folds multi-byte UTF-8 titles without exceeding 75 octets per line or corrupting characters', () => {
		const title = '🌴'.repeat(40);
		const feed = buildIcalFeed('x', [makeEvent({ title })]);

		for (const line of feed.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}

		// No lone/unpaired surrogates anywhere in the output — astral code points
		// (e.g. emoji) must never be split across a fold boundary.
		expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(feed)).toBe(false);
		expect(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(feed)).toBe(false);

		// Unfolding (removing every CRLF + single leading space) must round-trip
		// to a string containing the escaped original title, uncorrupted.
		const unfolded = feed.replace(/\r\n /g, '');
		expect(unfolded).toContain(title);
	});

	it('folds a long title into multiple physical lines within the 75-octet budget', () => {
		const feed = buildIcalFeed('x', [makeEvent({ title: 'z'.repeat(200) })]);
		const summaryStart = feed.indexOf('SUMMARY:');
		const nextField = feed.indexOf('\r\nDTSTART', summaryStart);
		const summaryBlock = feed.slice(summaryStart, nextField);
		const summaryLines = summaryBlock.split('\r\n');

		expect(summaryLines.length).toBeGreaterThanOrEqual(3);
		for (const line of summaryLines) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
	});
});
