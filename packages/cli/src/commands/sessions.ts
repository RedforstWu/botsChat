import { Command } from "commander";
import { sessionsApi } from "../lib/api-client.js";
import {
  printTable,
  printJson,
  printError,
  isJsonMode,
} from "../lib/output.js";

export const sessionsCmd = new Command("sessions")
  .description("Manage sessions")
  .argument("<channelId>", "Channel ID")
  .action(async (channelId: string) => {
    try {
      const { sessions } = await sessionsApi.list(channelId);
      printTable(
        sessions.map((s) => ({
          id: s.id,
          name: s.name,
          sessionKey: s.sessionKey,
          updated: new Date(s.updatedAt).toLocaleString(),
        })),
        [
          { key: "id", label: "ID", width: 20 },
          { key: "name", label: "Name", width: 25 },
          { key: "sessionKey", label: "Session Key", width: 40 },
          { key: "updated", label: "Updated", width: 20 },
        ],
      );
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

sessionsCmd
  .command("create <channelId>")
  .description("Create a new session")
  .option("--name <name>", "Session name")
  .action(async (channelId: string, opts) => {
    try {
      const session = await sessionsApi.create(channelId, opts.name);
      if (isJsonMode()) {
        printJson(session);
      } else {
        console.log(
          `Session created: ${session.id} (key: ${session.sessionKey})`,
        );
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

sessionsCmd
  .command("rename <channelId> <sessionId> <name>")
  .description("Rename a session")
  .action(async (channelId: string, sessionId: string, name: string) => {
    try {
      await sessionsApi.rename(channelId, sessionId, name);
      console.log("Session renamed.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

sessionsCmd
  .command("delete <channelId> <sessionId>")
  .description("Delete a session")
  .option("-y, --yes", "Skip confirmation")
  .action(async (channelId: string, sessionId: string, opts) => {
    try {
      if (!opts.yes) {
        const { createInterface } = await import("node:readline/promises");
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
        });
        const answer = await rl.question(
          `Delete session ${sessionId}? [y/N] `,
        );
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Cancelled.");
          return;
        }
      }
      await sessionsApi.delete(channelId, sessionId);
      console.log("Session deleted.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
