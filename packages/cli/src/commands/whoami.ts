import { Command } from "commander";
import { authApi } from "../lib/api-client.js";
import { printResult, printError } from "../lib/output.js";

export const whoamiCmd = new Command("whoami")
  .description("Show current user info")
  .action(async () => {
    try {
      const me = await authApi.me();
      printResult({
        id: me.id,
        email: me.email,
        displayName: me.displayName ?? "(not set)",
        defaultModel: me.settings.defaultModel ?? "(not set)",
      });
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
