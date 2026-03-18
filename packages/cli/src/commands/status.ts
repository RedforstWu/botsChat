import { Command } from "commander";
import { connectionApi } from "../lib/api-client.js";
import { loadConfig } from "../lib/config.js";
import { printResult, printError } from "../lib/output.js";

export const statusCmd = new Command("status")
  .description("Show OpenClaw connection status")
  .action(async () => {
    try {
      const cfg = loadConfig();
      if (!cfg.userId) {
        printError("Not logged in. Run 'botschat login' first.");
        process.exit(1);
      }
      const result = await connectionApi.status(cfg.userId);
      printResult({
        connected: result.connected ? "yes" : "no",
        agents: result.agents?.join(", ") || "(none)",
        model: result.model ?? "(not set)",
      });
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
