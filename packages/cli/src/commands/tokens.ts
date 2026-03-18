import { Command } from "commander";
import { pairingApi } from "../lib/api-client.js";
import {
  printTable,
  printJson,
  printError,
  isJsonMode,
} from "../lib/output.js";

export const tokensCmd = new Command("tokens")
  .description("Manage pairing tokens")
  .action(async () => {
    try {
      const { tokens } = await pairingApi.list();
      printTable(
        tokens.map((t) => ({
          id: t.id,
          preview: t.tokenPreview,
          label: t.label ?? "",
          lastConnected: t.lastConnectedAt
            ? new Date(t.lastConnectedAt).toLocaleString()
            : "never",
          created: new Date(t.createdAt).toLocaleString(),
        })),
        [
          { key: "id", label: "ID", width: 20 },
          { key: "preview", label: "Token", width: 20 },
          { key: "label", label: "Label", width: 15 },
          { key: "lastConnected", label: "Last Connected", width: 20 },
          { key: "created", label: "Created", width: 20 },
        ],
      );
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tokensCmd
  .command("create")
  .description("Create a new pairing token")
  .option("--label <label>", "Token label")
  .action(async (opts) => {
    try {
      const result = await pairingApi.create(opts.label);
      if (isJsonMode()) {
        printJson(result);
      } else {
        console.log(`Token created: ${result.token}`);
        console.log(`ID: ${result.id}`);
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

tokensCmd
  .command("delete <id>")
  .description("Revoke a pairing token")
  .action(async (id: string) => {
    try {
      await pairingApi.delete(id);
      console.log("Token revoked.");
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
