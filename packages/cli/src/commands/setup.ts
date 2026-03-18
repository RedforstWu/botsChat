import { Command } from "commander";
import {
  setupApi,
  setToken,
  setRefreshToken,
} from "../lib/api-client.js";
import { updateConfig } from "../lib/config.js";
import { printJson, printError, isJsonMode } from "../lib/output.js";

export const setupCmd = new Command("setup")
  .description("One-shot onboarding (setup/init)")
  .option("--secret <secret>", "Dev auth secret")
  .option("--email <email>", "Email")
  .option("--password <password>", "Password")
  .option("--user <userId>", "User ID for dev auth")
  .action(async (opts) => {
    try {
      const data: Record<string, string> = {};
      if (opts.secret) data.secret = opts.secret;
      if (opts.email) data.email = opts.email;
      if (opts.password) data.password = opts.password;
      if (opts.user) data.userId = opts.user;

      const result = await setupApi.init(data);

      setToken(result.token);
      if (result.refreshToken) setRefreshToken(result.refreshToken);
      updateConfig({ userId: result.userId });

      if (isJsonMode()) {
        printJson(result);
      } else {
        console.log(`User ID:       ${result.userId}`);
        console.log(`Pairing Token: ${result.pairingToken}`);
        console.log(`Cloud URL:     ${result.cloudUrl}`);
        if (result.channels.length > 0) {
          console.log(
            `Channel:       ${result.channels[0].name} (${result.channels[0].id})`,
          );
        }
        if (result.setupCommands.length > 0) {
          console.log("\nSetup commands for OpenClaw plugin:");
          for (const cmd of result.setupCommands) {
            console.log(`  ${cmd}`);
          }
        }
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
