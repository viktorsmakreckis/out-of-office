import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { m } from '$lib/paraglide/messages.js';
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime';

export interface EmailContent {
	subject: string;
	html: string;
	text: string;
}

/** Locale stored on the better-auth user (always set at signup), with a safe fallback. */
export function userLocale(user: Record<string, unknown>): Locale {
	return isLocale(user.locale) ? user.locale : baseLocale;
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function actionEmail(subject: string, body: string, cta: string, url: string): EmailContent {
	return {
		subject,
		text: `${body}\n\n${url}`,
		html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px 0">
	<h1 style="font-size:20px">${escapeHtml(subject)}</h1>
	<p>${escapeHtml(body)}</p>
	<p><a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(cta)}</a></p>
	<p style="color:#71717a;font-size:12px;word-break:break-all">${url}</p>
</div>`
	};
}

export function verificationEmail(url: string, locale: Locale): EmailContent {
	const o = { locale };
	return actionEmail(
		m.email_verify_subject({}, o),
		m.email_verify_body({}, o),
		m.email_verify_cta({}, o),
		url
	);
}

export function resetPasswordEmail(url: string, locale: Locale): EmailContent {
	const o = { locale };
	return actionEmail(
		m.email_reset_subject({}, o),
		m.email_reset_body({}, o),
		m.email_reset_cta({}, o),
		url
	);
}

export function changeEmailConfirmationEmail(
	url: string,
	newEmail: string,
	locale: Locale
): EmailContent {
	const o = { locale };
	return actionEmail(
		m.email_change_subject({}, o),
		m.email_change_body({ newEmail }, o),
		m.email_change_cta({}, o),
		url
	);
}

export async function sendEmail(to: string, content: EmailContent): Promise<void> {
	if (!env.RESEND_API_KEY) {
		console.info(`[email] to=${to} subject="${content.subject}"\n${content.text}`);
		return;
	}
	const resend = new Resend(env.RESEND_API_KEY);
	const { error } = await resend.emails.send({
		from: env.RESEND_EMAIL_ADDRESS,
		to,
		subject: content.subject,
		html: content.html,
		text: content.text
	});
	if (error) throw new Error(`Failed to send email "${content.subject}": ${error.message}`);
}
