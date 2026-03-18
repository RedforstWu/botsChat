import { Command } from "commander";
import { messagesApi } from "../lib/api-client.js";
import { loadConfig } from "../lib/config.js";
import { E2eService } from "../lib/e2e.js";
import { printJson, printError, isJsonMode } from "../lib/output.js";

export const messagesCmd = new Command("messages")
  .description("View message history")
  .argument("<sessionKey>", "Session key")
  .option("--limit <n>", "Max results", "50")
  .option("--thread <threadId>", "Thread ID")
  .action(async (sessionKey: string, opts) => {
    try {
      const cfg = loadConfig();
      if (!cfg.userId) {
        printError("Not logged in.");
        process.exit(1);
      }

      const { messages } = await messagesApi.list(
        cfg.userId,
        sessionKey,
        opts.thread,
      );

      // E2E decrypt
      for (const msg of messages) {
        if (msg.encrypted && msg.text && E2eService.hasKey()) {
          try {
            msg.text = await E2eService.decrypt(msg.text, msg.id);
            msg.encrypted = false;
          } catch {
            msg.text = "[decryption failed]";
          }
        }
      }

      if (isJsonMode()) {
        printJson(messages);
      } else {
        for (const msg of messages) {
          const time = new Date(msg.timestamp).toLocaleString();
          const prefix = msg.sender === "user" ? "You" : "AI";
          const enc = msg.encrypted ? " [encrypted]" : "";
          console.log(`[${time}] ${prefix}: ${msg.text}${enc}`);
        }
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });
