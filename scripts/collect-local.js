import { runCollectJob } from "../src/lib/collect-job.js";
import { shouldFailCollectProcess } from "../src/lib/collect-result.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const result = await runCollectJob();
console.log(JSON.stringify(result, null, 2));

if (shouldFailCollectProcess(result)) {
  process.exitCode = 1;
}
