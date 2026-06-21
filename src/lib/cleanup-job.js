import { cleanupOldData } from "./repository.js";

export async function runCleanupJob({ eventRetentionDays = 60, runRetentionDays = 90 } = {}) {
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
