import { getLocalTimeZone, parseDate, today, type CalendarDate } from '@internationalized/date';
import type { CalendarView } from '$lib/components/calendar';
import type { PageLoad } from './$types';

const VIEWS: readonly CalendarView[] = ['month', 'week', 'agenda'];

export const load: PageLoad = ({ url }) => {
	const viewParam = url.searchParams.get('view') as CalendarView | null;
	const view: CalendarView = viewParam && VIEWS.includes(viewParam) ? viewParam : 'month';
	let date: CalendarDate;
	try {
		date = parseDate(url.searchParams.get('date') ?? '');
	} catch {
		date = today(getLocalTimeZone());
	}
	return { view, date };
};
