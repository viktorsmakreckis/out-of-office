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
