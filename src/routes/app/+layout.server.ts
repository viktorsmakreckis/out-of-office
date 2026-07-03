import { redirect } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const [{ unreadCount }] = await db
		.select({ unreadCount: count() })
		.from(notification)
		.where(and(eq(notification.userId, locals.user.id), isNull(notification.readAt)));
	return { user: locals.user, unreadCount };
};
