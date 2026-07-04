import { describe, expect, it } from 'vitest';
import { buildDigestMessage, digestHeaderText, digestRosterText } from './digest-message';

const events = [
	{
		userName: 'Bob',
		type: 'sick_leave',
		title: null,
		allDay: true,
		start: new Date('2026-07-10T00:00:00Z'),
		end: new Date('2026-07-10T00:00:00Z')
	},
	{
		userName: 'Alice',
		type: 'vacation',
		title: null,
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z')
	}
];

describe('buildDigestMessage', () => {
	it('groups by member sorted by name, items by start', () => {
		const m = buildDigestMessage('Team A', 'Jul 6 – Jul 12', events, 'en-GB');
		expect(m.orgName).toBe('Team A');
		expect(m.entries.map((e) => e.actorName)).toEqual(['Alice', 'Bob']);
		expect(m.entries[0].items[0]).toEqual({
			emoji: '🌴',
			label: 'Vacation',
			dateRange: '6 Jul – 8 Jul'
		});
		expect(m.entries[1].items[0]).toEqual({
			emoji: '🤒',
			label: 'Sick leave',
			dateRange: '10 Jul'
		});
	});

	it('uses the title as the label when present', () => {
		const m = buildDigestMessage(
			'Team A',
			'Jul 6 – Jul 12',
			[
				{
					userName: 'Alice',
					type: 'business_trip',
					title: 'Berlin',
					allDay: true,
					start: new Date('2026-07-06T00:00:00Z'),
					end: new Date('2026-07-06T00:00:00Z')
				}
			],
			'en-GB'
		);
		expect(m.entries[0].items[0].label).toBe('Berlin');
	});
});

describe('digest text', () => {
	it('renders a header and a bolded roster line per member', () => {
		const m = buildDigestMessage('Team A', 'Jul 6 – Jul 12', events, 'en-GB');
		expect(digestHeaderText(m)).toBe('🗓️ Team A — time off for Jul 6 – Jul 12');
		expect(digestRosterText(m, (s) => `*${s}*`)).toBe(
			'*Alice* — 🌴 Vacation (6 Jul – 8 Jul)\n*Bob* — 🤒 Sick leave (10 Jul)'
		);
	});

	it('renders the full-house line when nobody is off', () => {
		const m = buildDigestMessage('Team A', 'Jul 6 – Jul 12', [], 'en-GB');
		expect(digestRosterText(m, (s) => `*${s}*`)).toBe(
			"🎉 Full house — nobody's off during Jul 6 – Jul 12."
		);
	});
});
