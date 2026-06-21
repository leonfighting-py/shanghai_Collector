import { runCleanupJob } from "../src/lib/cleanup-job.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const result = await runCleanupJob();
console.log(JSON.stringify(result, null, 2));
