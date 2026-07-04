import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const integrationProviders = ['slack', 'discord', 'msteams'] as const;

export const addConnectionSchema = z.object({
	provider: z.enum(integrationProviders, { error: () => m.error_generic() }),
	webhookUrl: z
		.string()
		.trim()
		.max(2048)
		.refine((value) => z.url().safeParse(value).success, {
			error: () => m.integrations_invalid_webhook_url()
		}),
	label: z.string().trim().max(100).default('')
});

export const connectionIdSchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() })
});

export const updateConnectionNotifySchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() }),
	notifyOoo: z.enum(['true', 'false']).transform((value) => value === 'true')
});

const supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));

export const saveDigestSchema = z.object({
	enabled: z.boolean(),
	weekday: z.number().int().min(1).max(7),
	hour: z.number().int().min(0).max(23),
	timezone: z.string().refine((value) => supportedTimeZones.has(value), {
		error: () => m.error_generic()
	}),
	postWhenEmpty: z.boolean()
});

export const updateConnectionDigestSchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() }),
	notifyDigest: z.enum(['true', 'false']).transform((value) => value === 'true')
});
