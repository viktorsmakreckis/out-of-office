import { eventTypeLabelFor } from '$lib/events/labels';
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime';
import { emojiForType, formatDateRange } from './message';

export type DigestItem = { emoji: string; label: string; dateRange: string };
export type DigestEntry = { actorName: string; items: DigestItem[] };
export type DigestMessage = {
	orgName: string;
	weekLabel: string;
	entries: DigestEntry[];
	locale: Locale;
};

export type DigestSourceEvent = {
	userName: string;
	type: string;
	title: string | null;
	allDay: boolean;
	start: Date;
	end: Date;
};

/** Groups events by member (name-sorted), items start-sorted, rendered in `locale`. */
export function buildDigestMessage(
	orgName: string,
	weekLabel: string,
	events: DigestSourceEvent[],
	locale: Locale
): DigestMessage {
	const byMember = new Map<string, DigestItem[]>();
	for (const event of [...events].sort((a, b) => a.start.getTime() - b.start.getTime())) {
		const item: DigestItem = {
			emoji: emojiForType(event.type),
			label: event.title ?? eventTypeLabelFor(event.type, locale),
			dateRange: formatDateRange(event.start, event.end, event.allDay, locale)
		};
		const items = byMember.get(event.userName);
		if (items) items.push(item);
		else byMember.set(event.userName, [item]);
	}
	const entries = [...byMember.entries()]
		.map(([actorName, items]) => ({ actorName, items }))
		.sort((a, b) => a.actorName.localeCompare(b.actorName, locale));
	return { orgName, weekLabel, entries, locale };
}

export function digestHeaderText(message: DigestMessage): string {
	return m.digest_channel_header(
		{ team: message.orgName, range: message.weekLabel },
		{ locale: message.locale }
	);
}

/** The roster body: one bolded line per member, or the full-house line when empty. */
export function digestRosterText(message: DigestMessage, bold: (s: string) => string): string {
	if (message.entries.length === 0) {
		return m.digest_channel_empty({ range: message.weekLabel }, { locale: message.locale });
	}
	return message.entries
		.map(
			(entry) =>
				`${bold(entry.actorName)} — ${entry.items
					.map((item) => `${item.emoji} ${item.label} (${item.dateRange})`)
					.join(', ')}`
		)
		.join('\n');
}
