import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import {
	changeEmailConfirmationEmail,
	resetPasswordEmail,
	sendEmail,
	userLocale,
	verificationEmail
} from '$lib/server/email';
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
	plugins: [
		organization({
			sendInvitationEmail: async (data) => {
				// Replaced in a later task once invite emails + notifications exist.
				console.info(`[team-invite] to=${data.email} team=${data.organization.name}`);
			}
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});

export type AuthSession = typeof auth.$Infer.Session;
