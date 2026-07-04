import { Worker, type Job } from 'bullmq';
import { sendTeamDigest } from '$lib/server/integrations/digest';
import { getRedisConnection } from './connection';
import { DIGEST_QUEUE_NAME, type DigestJobData } from './digest-cron';
import { reconcileDigestSchedules } from './digest-schedule';

const g = globalThis as unknown as { __oooDigestWorkerStarted?: boolean };

/**
 * Starts the in-process digest worker once per server process and reconciles the
 * per-team schedulers against the DB. No-op without Redis or when already started.
 */
export function startDigestWorker(): void {
	if (g.__oooDigestWorkerStarted) return;
	const connection = getRedisConnection();
	if (!connection) return;
	g.__oooDigestWorkerStarted = true;
	const worker = new Worker<DigestJobData>(
		DIGEST_QUEUE_NAME,
		async (job: Job<DigestJobData>) => {
			await sendTeamDigest(job.data.orgId);
		},
		{ connection, concurrency: 5 }
	);
	worker.on('failed', (job, err) => console.error('[digest] job failed:', job?.id, err));
	worker.on('error', (err) => console.error('[digest] worker error:', err));

	const shutdown = async () => {
		try {
			await worker.close();
		} catch (err) {
			console.error('[digest] worker shutdown error:', err);
		}
	};
	process.once('SIGTERM', shutdown);
	process.once('SIGINT', shutdown);

	reconcileDigestSchedules().catch((err) =>
		console.error('[digest] schedule reconcile failed:', err)
	);
}
