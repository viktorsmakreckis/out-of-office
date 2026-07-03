import { Worker, type Job } from 'bullmq';
import { deliverEventChange } from '$lib/server/notifications';
import { getRedisConnection } from './connection';
import { fromEventDeliveryJob, QUEUE_NAME, type EventDeliveryJobData } from './job';

// globalThis flag survives dev HMR module reloads so we never spawn duplicate workers.
const g = globalThis as unknown as { __oooWorkerStarted?: boolean };

/**
 * Starts the in-process BullMQ worker once per server process. No-op when Redis
 * is not configured (dev without Redis) or when already started.
 */
export function startNotificationWorker(): void {
	if (g.__oooWorkerStarted) return;
	const connection = getRedisConnection();
	if (!connection) return;
	g.__oooWorkerStarted = true;
	const worker = new Worker<EventDeliveryJobData>(
		QUEUE_NAME,
		async (job: Job<EventDeliveryJobData>) => {
			await deliverEventChange(fromEventDeliveryJob(job.data));
		},
		{ connection, concurrency: 5 }
	);
	worker.on('failed', (job, err) => console.error('[queue] job failed:', job?.id, err));
	worker.on('error', (err) => console.error('[queue] worker error:', err));

	// Drain the in-flight job before exit so a deploy doesn't kill it mid-delivery
	// (a killed job is retried on the next boot, re-sending already-delivered messages).
	// Additive process.once listeners that coexist with adapter-node's own signal handling;
	// we never call process.exit ourselves — the current job just keeps the loop alive until close().
	const shutdown = async () => {
		try {
			await worker.close();
		} catch (err) {
			console.error('[queue] worker shutdown error:', err);
		}
	};
	process.once('SIGTERM', shutdown);
	process.once('SIGINT', shutdown);
}
