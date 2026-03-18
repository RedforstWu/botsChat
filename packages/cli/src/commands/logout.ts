import { Command } from "commander";
import { updateConfig } from "../lib/config.js";

export const logoutCmd = new Command("logout")
  .description("Clear authentication tokens")
  .action(() => {
    updateConfig({
      token: null,
      refreshToken: null,
      userId: null,
    });
    console.log("Logged out.");
  });
