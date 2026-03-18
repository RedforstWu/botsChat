import { Command } from "commander";
import { modelsApi, meApi } from "../lib/api-client.js";
import { printTable, printError } from "../lib/output.js";

export const modelsCmd = new Command("models")
  .description("Manage models")
  .action(async () => {
    try {
      const { models } = await modelsApi.list();
      printTable(
        models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
        })),
        [
          { key: "id", label: "ID", width: 35 },
          { key: "name", label: "Name", width: 25 },
          { key: "provider", label: "Provider", width: 20 },
        ],
      );
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

modelsCmd
  .command("set <modelId>")
  .description("Set default model")
  .action(async (modelId: string) => {
    try {
      await meApi.updateSettings({ defaultModel: modelId });
      console.log(`Default model set to: ${modelId}`);
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
