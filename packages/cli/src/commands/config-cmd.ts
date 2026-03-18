import { Command } from "commander";
import { loadConfig, updateConfig, type CliConfig } from "../lib/config.js";
import { E2eService } from "../lib/e2e.js";
import { printResult, printError, printJson, isJsonMode } from "../lib/output.js";

export const configCmd = new Command("config")
  .description("View/edit CLI configuration")
  .action(() => {
    const cfg = loadConfig();
    const masked: Record<string, unknown> = {
      url: cfg.url,
      userId: cfg.userId ?? "(not set)",
      token: cfg.token ? cfg.token.slice(0, 10) + "..." : "(not set)",
      refreshToken: cfg.refreshToken ? "***" : "(not set)",
      e2ePassword: cfg.e2ePassword ? "***" : "(not set)",
      defaultChannel: cfg.defaultChannel ?? "(not set)",
      defaultSession: cfg.defaultSession ?? "(not set)",
    };
    if (isJsonMode()) {
      printJson(masked);
    } else {
      printResult(masked as Record<string, unknown>);
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set a config value")
  .action((key: string, value: string) => {
    const validKeys: (keyof CliConfig)[] = [
      "url",
      "defaultChannel",
      "defaultSession",
    ];
    if (!validKeys.includes(key as keyof CliConfig)) {
      printError(
        `Invalid key. Valid keys: ${validKeys.join(", ")}`,
      );
      process.exit(1);
    }
    updateConfig({ [key]: value });
    console.log(`${key} = ${value}`);
  });

configCmd
  .command("e2e")
  .description("Manage E2E encryption password")
  .option("--password <password>", "Set E2E password")
  .option("--clear", "Remove E2E password")
  .action(async (opts) => {
    try {
      const cfg = loadConfig();
      if (!cfg.userId) {
        printError("Not logged in. Run 'botschat login' first.");
        process.exit(1);
      }

      if (opts.clear) {
        E2eService.clear();
        console.log("E2E password cleared.");
        return;
      }

      let password = opts.password;
      if (!password) {
        const { createInterface } = await import("node:readline/promises");
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
        });
        password = await rl.question("E2E Password: ");
        rl.close();
      }

      if (!password) {
        printError("Password is required.");
        process.exit(1);
      }

      await E2eService.setPassword(password, cfg.userId, true);
      console.log("E2E password set and key derived.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
