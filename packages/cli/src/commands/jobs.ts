import { Command } from "commander";
import { jobsApi } from "../lib/api-client.js";
import { E2eService } from "../lib/e2e.js";
import { printTable, printError } from "../lib/output.js";

export const jobsCmd = new Command("jobs")
  .description("View job history")
  .argument("<taskId>", "Task ID")
  .option("--limit <n>", "Max results", "50")
  .action(async (taskId: string) => {
    try {
      const { jobs } = await jobsApi.listByTask(taskId);

      // E2E decrypt summaries
      for (const job of jobs) {
        if (job.encrypted && job.summary && E2eService.hasKey()) {
          try {
            job.summary = await E2eService.decrypt(job.summary, job.id);
            job.encrypted = false;
          } catch {
            job.summary = "[decryption failed]";
          }
        }
      }

      printTable(
        jobs.map((j) => ({
          id: j.id,
          number: j.number,
          status: j.status,
          started: new Date(j.startedAt).toLocaleString(),
          duration: j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s` : "-",
          summary: j.summary || "",
        })),
        [
          { key: "number", label: "#", width: 5 },
          { key: "status", label: "Status", width: 10 },
          { key: "started", label: "Started", width: 20 },
          { key: "duration", label: "Duration", width: 10 },
          { key: "summary", label: "Summary", width: 40 },
        ],
      );
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
