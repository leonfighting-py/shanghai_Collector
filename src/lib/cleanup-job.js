import { cleanupOldData, EVENT_RETENTION_DAYS, RUN_RETENTION_DAYS } from "./repository.js";

export async function runCleanupJob({
  eventRetentionDays = EVENT_RETENTION_DAYS,
  runRetentionDays = RUN_RETENTION_DAYS,
} = {}) {
  const result = await cleanupOldData({ eventRetentionDays, runRetentionDays });

  return {
    ok: true,
    retention: {
      events_days: eventRetentionDays,
      runs_days: runRetentionDays,
    },
    ...result,
  };
}
