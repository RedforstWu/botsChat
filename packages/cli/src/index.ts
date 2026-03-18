#!/usr/bin/env node
import { Command } from "commander";
import { setConfigPath, updateConfig } from "./lib/config.js";
import { setJsonMode } from "./lib/output.js";
import { initApiClient, setApiBase } from "./lib/api-client.js";
import { initE2eFromConfig } from "./lib/e2e.js";

// Commands
import { loginCmd } from "./commands/login.js";
import { logoutCmd } from "./commands/logout.js";
import { whoamiCmd } from "./commands/whoami.js";
import { channelsCmd } from "./commands/channels.js";
import { sessionsCmd } from "./commands/sessions.js";
import { tokensCmd } from "./commands/tokens.js";
import { modelsCmd } from "./commands/models.js";
import { statusCmd } from "./commands/status.js";
import { chatCmd } from "./commands/chat.js";
import { tasksCmd } from "./commands/tasks.js";
import { jobsCmd } from "./commands/jobs.js";
import { messagesCmd } from "./commands/messages.js";
import { configCmd } from "./commands/config-cmd.js";
import { setupCmd } from "./commands/setup.js";

const program = new Command();

program
  .name("botschat")
  .description("BotsChat CLI — headless client for BotsChat")
  .version("0.1.0")
  .option("--json", "Output JSON (machine-readable)")
  .option("--url <url>", "Override server URL")
  .option("--config <path>", "Config file path")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.config) setConfigPath(opts.config);
    if (opts.json) setJsonMode(true);

    // Persist --url to config so subsequent commands use it
    if (opts.url) updateConfig({ url: opts.url });

    // Init API client from config
    initApiClient();

    // Apply --url override after loading config (in case initApiClient read old value)
    if (opts.url) setApiBase(opts.url);

    // Init E2E from cached key
    initE2eFromConfig();
  });

program.addCommand(loginCmd);
program.addCommand(logoutCmd);
program.addCommand(whoamiCmd);
program.addCommand(setupCmd);
program.addCommand(channelsCmd);
program.addCommand(sessionsCmd);
program.addCommand(tokensCmd);
program.addCommand(modelsCmd);
program.addCommand(statusCmd);
program.addCommand(chatCmd);
program.addCommand(tasksCmd);
program.addCommand(jobsCmd);
program.addCommand(messagesCmd);
program.addCommand(configCmd);

program.parse();
