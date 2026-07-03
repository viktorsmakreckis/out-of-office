import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { eq } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { calendarShare, notification, user } from '$lib/server/db/schema';
import {
	changeEmailConfirmationEmail,
	resetPasswordEmail,
	sendEmail,
	teamInviteEmail,
	userLocale,
	verificationEmail
} from '$lib/server/email';
import { sharerDisplayName } from '$lib/server/notifications';
import { baseLocale } from '$lib/paraglide/runtime';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	rateLimit: {
		enabled: true, // default is production-only; keep it on in dev so it's testable
		storage: 'database'
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail(user.email, resetPasswordEmail(url, userLocale(user)));
		}
	},
	emailVerification: {
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail(user.email, verificationEmail(url, userLocale(user)));
		}
	},
	user: {
		additionalFields: {
			timezone: { type: 'string', required: true, defaultValue: 'UTC' },
			locale: { type: 'string', required: true, defaultValue: baseLocale }
		},
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
				await sendEmail(user.email, changeEmailConfirmationEmail(url, newEmail, userLocale(user)));
			}
		},
		deleteUser: { enabled: true }
	},
	databaseHooks: {
		user: {
			create: {
				after: async (newUser) => {
					const pending = await db
						.select()
						.from(calendarShare)
						.where(eq(calendarShare.targetEmail, newUser.email));
					for (const share of pending) {
						try {
							await db
								.update(calendarShare)
								.set({ targetUserId: newUser.id, targetEmail: null })
								.where(eq(calendarShare.id, share.id));
						} catch (err) {
							if ((err as { code?: string }).code !== '23505') {
								console.error('[auth] pending share conversion failed:', err);
								continue;
							}
							// The sharer already has an explicit share to this user: drop the pending row.
							await db.delete(calendarShare).where(eq(calendarShare.id, share.id));
							continue;
						}
						await db.insert(notification).values({
							userId: newUser.id,
							type: 'calendar_shared',
							actorName: await sharerDisplayName(share),
							data: { shareId: share.id }
						});
					}
				}
			}
		}
	},
	plugins: [
		organization({
			// Team language drives the locale of integration/webhook channel messages.
			schema: {
				organization: {
					additionalFields: {
						locale: { type: 'string', required: false, input: true, defaultValue: baseLocale }
					}
				}
			},
			sendInvitationEmail: async (data) => {
				const invitee = await db.select().from(user).where(eq(user.email, data.email)).limit(1);
				const locale = invitee[0] ? userLocale(invitee[0]) : baseLocale;
				await sendEmail(
					data.email,
					teamInviteEmail(
						data.inviter.user.name,
						data.organization.name,
						`${env.ORIGIN}/app/notifications`,
						locale
					)
				);
				if (invitee[0]) {
					await db.insert(notification).values({
						userId: invitee[0].id,
						type: 'team_invite',
						actorName: data.inviter.user.name,
						data: { invitationId: data.id, teamName: data.organization.name }
					});
				}
			}
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});

export type AuthSession = typeof auth.$Infer.Session;
