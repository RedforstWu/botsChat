import { Command } from "commander";
import { channelsApi } from "../lib/api-client.js";
import {
  printTable,
  printResult,
  printJson,
  printError,
  isJsonMode,
} from "../lib/output.js";

export const channelsCmd = new Command("channels")
  .description("Manage channels")
  .action(async () => {
    try {
      const { channels } = await channelsApi.list();
      printTable(
        channels.map((c) => ({
          id: c.id,
          name: c.name,
          agent: c.openclawAgentId,
          updated: new Date(c.updatedAt).toLocaleString(),
        })),
        [
          { key: "id", label: "ID", width: 20 },
          { key: "name", label: "Name", width: 20 },
          { key: "agent", label: "Agent", width: 15 },
          { key: "updated", label: "Updated", width: 20 },
        ],
      );
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

channelsCmd
  .command("show <id>")
  .description("Show channel details")
  .action(async (id: string) => {
    try {
      const ch = await channelsApi.get(id);
      printResult({
        id: ch.id,
        name: ch.name,
        description: ch.description || "(none)",
        openclawAgentId: ch.openclawAgentId,
        systemPrompt: ch.systemPrompt || "(none)",
        createdAt: new Date(ch.createdAt).toLocaleString(),
        updatedAt: new Date(ch.updatedAt).toLocaleString(),
      });
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

channelsCmd
  .command("create <name>")
  .description("Create a new channel")
  .option("--description <desc>", "Channel description")
  .option("--agent-id <agentId>", "OpenClaw agent ID")
  .option("--system-prompt <prompt>", "System prompt")
  .action(async (name: string, opts) => {
    try {
      const ch = await channelsApi.create({
        name,
        description: opts.description,
        openclawAgentId: opts.agentId,
        systemPrompt: opts.systemPrompt,
      });
      if (isJsonMode()) {
        printJson(ch);
      } else {
        console.log(`Channel created: ${ch.id} (${ch.name})`);
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

channelsCmd
  .command("update <id>")
  .description("Update a channel")
  .option("--name <name>", "New name")
  .option("--description <desc>", "New description")
  .option("--system-prompt <prompt>", "New system prompt")
  .action(async (id: string, opts) => {
    try {
      const data: Record<string, string> = {};
      if (opts.name) data.name = opts.name;
      if (opts.description) data.description = opts.description;
      if (opts.systemPrompt) data.systemPrompt = opts.systemPrompt;
      await channelsApi.update(id, data);
      console.log("Channel updated.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

channelsCmd
  .command("delete <id>")
  .description("Delete a channel")
  .option("-y, --yes", "Skip confirmation")
  .action(async (id: string, opts) => {
    try {
      if (!opts.yes) {
        const { createInterface } = await import("node:readline/promises");
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
        });
        const answer = await rl.question(
          `Delete channel ${id}? [y/N] `,
        );
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Cancelled.");
          return;
        }
      }
      await channelsApi.delete(id);
      console.log("Channel deleted.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
