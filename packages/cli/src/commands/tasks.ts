import { Command } from "commander";
import { tasksApi } from "../lib/api-client.js";
import {
  printTable,
  printJson,
  printError,
  isJsonMode,
} from "../lib/output.js";

export const tasksCmd = new Command("tasks")
  .description("Manage background tasks")
  .action(async () => {
    try {
      const { tasks } = await tasksApi.listAll("background");
      printTable(
        tasks.map((t) => ({
          id: t.id,
          name: t.name,
          channel: t.channelId,
          enabled: t.enabled ? "yes" : "no",
          schedule: t.schedule ?? "(none)",
          cronJobId: t.openclawCronJobId ?? "(none)",
        })),
        [
          { key: "id", label: "ID", width: 20 },
          { key: "name", label: "Name", width: 20 },
          { key: "channel", label: "Channel", width: 20 },
          { key: "enabled", label: "Enabled", width: 8 },
          { key: "schedule", label: "Schedule", width: 15 },
        ],
      );
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tasksCmd
  .command("list <channelId>")
  .description("List tasks for a channel")
  .action(async (channelId: string) => {
    try {
      const { tasks } = await tasksApi.list(channelId);
      printTable(
        tasks.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          enabled: t.enabled ? "yes" : "no",
          schedule: t.schedule ?? "(none)",
        })),
        [
          { key: "id", label: "ID", width: 20 },
          { key: "name", label: "Name", width: 20 },
          { key: "kind", label: "Kind", width: 12 },
          { key: "enabled", label: "Enabled", width: 8 },
          { key: "schedule", label: "Schedule", width: 15 },
        ],
      );
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tasksCmd
  .command("create <channelId> <name>")
  .description("Create a task")
  .option("--kind <kind>", "Task kind", "background")
  .option("--schedule <schedule>", "Cron schedule")
  .option("--instructions <text>", "Task instructions")
  .action(async (channelId: string, name: string, opts) => {
    try {
      const task = await tasksApi.create(channelId, {
        name,
        kind: opts.kind,
        schedule: opts.schedule,
        instructions: opts.instructions,
      });
      if (isJsonMode()) {
        printJson(task);
      } else {
        console.log(`Task created: ${task.id} (${task.name})`);
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tasksCmd
  .command("update <channelId> <taskId>")
  .description("Update a task")
  .option("--name <name>", "New name")
  .option("--schedule <schedule>", "New schedule")
  .option("--instructions <text>", "New instructions")
  .option("--model <model>", "New model")
  .option("--enabled <bool>", "Enable/disable")
  .action(async (channelId: string, taskId: string, opts) => {
    try {
      const data: Record<string, unknown> = {};
      if (opts.name) data.name = opts.name;
      if (opts.schedule) data.schedule = opts.schedule;
      if (opts.instructions) data.instructions = opts.instructions;
      if (opts.model) data.model = opts.model;
      if (opts.enabled !== undefined)
        data.enabled = opts.enabled === "true";
      await tasksApi.update(channelId, taskId, data);
      console.log("Task updated.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tasksCmd
  .command("delete <channelId> <taskId>")
  .description("Delete a task")
  .option("-y, --yes", "Skip confirmation")
  .action(async (channelId: string, taskId: string, opts) => {
    try {
      if (!opts.yes) {
        const { createInterface } = await import("node:readline/promises");
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
        });
        const answer = await rl.question(`Delete task ${taskId}? [y/N] `);
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Cancelled.");
          return;
        }
      }
      await tasksApi.delete(channelId, taskId);
      console.log("Task deleted.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tasksCmd
  .command("run <channelId> <taskId>")
  .description("Run a task immediately")
  .action(async (channelId: string, taskId: string) => {
    try {
      const result = await tasksApi.run(channelId, taskId);
      console.log(result.message || "Task execution triggered.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tasksCmd
  .command("scan")
  .description("Show live OpenClaw task data")
  .action(async () => {
    try {
      const { tasks } = await tasksApi.scanData();
      if (isJsonMode()) {
        printJson(tasks);
      } else {
        printTable(
          tasks.map((t) => ({
            cronJobId: t.cronJobId,
            schedule: t.schedule,
            model: t.model || "(default)",
            enabled: t.enabled ? "yes" : "no",
            encrypted: t.encrypted ? "yes" : "no",
          })),
          [
            { key: "cronJobId", label: "Cron Job ID", width: 38 },
            { key: "schedule", label: "Schedule", width: 15 },
            { key: "model", label: "Model", width: 20 },
            { key: "enabled", label: "Enabled", width: 8 },
          ],
        );
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
