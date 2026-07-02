import type { CalendarDate } from '@internationalized/date';
import { compareEvents, daysBetween, eventDateSpan, type CalendarEvent } from './types.js';

export type LaneSegment<T = unknown> = {
	event: CalendarEvent<T>;
	lane: number;
	/** 0-based column within the row. */
	startCol: number;
	/** Columns covered (≥ 1). */
	span: number;
	continuesLeft: boolean;
	continuesRight: boolean;
};

/**
 * Packs the events overlapping a row of `days` consecutive dates starting at `rowStart`
 * into horizontal lanes. First-fit in compareEvents order (earlier, then longer, first),
 * which keeps multi-day chips on stable upper lanes.
 */
export function packLanes<T>(
	events: CalendarEvent<T>[],
	rowStart: CalendarDate,
	days: number
): LaneSegment<T>[] {
	const rowEnd = rowStart.add({ days: days - 1 });
	const occupancy: boolean[][] = [];
	const segments: LaneSegment<T>[] = [];

	for (const event of [...events].sort(compareEvents)) {
		const span = eventDateSpan(event);
		if (span.start.compare(rowEnd) > 0 || span.end.compare(rowStart) < 0) continue;
		const startCol = Math.max(0, daysBetween(rowStart, span.start));
		const endCol = Math.min(days - 1, daysBetween(rowStart, span.end));

		let lane = 0;
		while (isOccupied(occupancy, lane, startCol, endCol)) lane++;
		markOccupied(occupancy, lane, startCol, endCol);

		segments.push({
			event,
			lane,
			startCol,
			span: endCol - startCol + 1,
			continuesLeft: span.start.compare(rowStart) < 0,
			continuesRight: span.end.compare(rowEnd) > 0
		});
	}
	return segments;
}

/** Per-column count of events hidden when only `maxLanes` lanes are rendered. */
export function overflowCounts(
	segments: LaneSegment<unknown>[],
	days: number,
	maxLanes: number
): number[] {
	const counts = new Array<number>(days).fill(0);
	for (const segment of segments) {
		if (segment.lane < maxLanes) continue;
		for (let col = segment.startCol; col < segment.startCol + segment.span; col++) counts[col]++;
	}
	return counts;
}

function isOccupied(
	occupancy: boolean[][],
	lane: number,
	startCol: number,
	endCol: number
): boolean {
	const row = occupancy[lane];
	if (!row) return false;
	for (let col = startCol; col <= endCol; col++) if (row[col]) return true;
	return false;
}

function markOccupied(
	occupancy: boolean[][],
	lane: number,
	startCol: number,
	endCol: number
): void {
	const row = (occupancy[lane] ??= []);
	for (let col = startCol; col <= endCol; col++) row[col] = true;
}
