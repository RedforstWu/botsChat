import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import {
  authApi,
  devAuthApi,
  setToken,
  setRefreshToken,
} from "../lib/api-client.js";
import { updateConfig, loadConfig } from "../lib/config.js";
import { printResult, printError, isJsonMode } from "../lib/output.js";

export const loginCmd = new Command("login")
  .description("Authenticate with BotsChat server")
  .option("--dev", "Use dev auth (local development)")
  .option("--secret <secret>", "Dev auth secret")
  .option("--user <userId>", "Dev auth user ID", "dev-test-user")
  .option("--email <email>", "Email for login")
  .option("--password <password>", "Password for login")
  .option("--no-open", "Print login URL instead of opening browser")
  .action(async (opts) => {
    try {
      if (opts.dev) {
        const secret = opts.secret;
        if (!secret) {
          printError("--secret is required for dev auth");
          process.exit(1);
        }
        const result = await devAuthApi.login(secret, opts.user);
        setToken(result.token);
        updateConfig({ userId: result.userId });

        if (isJsonMode()) {
          printResult({ userId: result.userId });
        } else {
          console.log(`Logged in as ${result.userId}`);
        }
      } else if (opts.email && opts.password) {
        const result = await authApi.login(opts.email, opts.password);
        setToken(result.token);
        if (result.refreshToken) setRefreshToken(result.refreshToken);
        updateConfig({ userId: result.id });

        if (isJsonMode()) {
          printResult({ id: result.id, email: result.email });
        } else {
          console.log(`Logged in as ${result.email} (${result.id})`);
        }
      } else {
        await browserLogin(opts.open !== false ? true : false);
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

/**
 * Browser-based login flow (same pattern as GitHub CLI):
 *
 * 1. CLI starts a local HTTP server on a random port
 * 2. CLI opens browser to http://127.0.0.1:PORT/start (local, HTTP)
 * 3. Local server 302-redirects to https://console.botschat.app/?cli_port=PORT&cli_state=STATE
 * 4. User logs in normally (Google/GitHub/Apple OAuth)
 * 5. After login, web app redirects browser back to http://127.0.0.1:PORT/callback?token=...
 * 6. CLI receives credentials, shows success page, saves config
 *
 * By starting from HTTP and returning to HTTP, we avoid Mixed Content blocking.
 */
async function browserLogin(autoOpen = true): Promise<void> {
  const cfg = loadConfig();
  const state = randomUUID();

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      // GET /start — redirect browser to BotsChat login page
      if (url.pathname === "/start") {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        const loginUrl = `${cfg.url}/?cli_port=${port}&cli_state=${encodeURIComponent(state)}`;
        res.writeHead(302, { Location: loginUrl });
        res.end();
        return;
      }

      // GET /callback?token=...&state=... — receive credentials from browser
      if (url.pathname === "/callback") {
        const token = url.searchParams.get("token");
        const refreshToken = url.searchParams.get("refreshToken");
        const userId = url.searchParams.get("userId");
        const email = url.searchParams.get("email");
        const displayName = url.searchParams.get("displayName");
        const reqState = url.searchParams.get("state");

        if (reqState !== state) {
          res.writeHead(403, { "Content-Type": "text/html" });
          res.end(successPage(false, "Invalid state. Please try again."));
          return;
        }

        if (!token || !userId) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(successPage(false, "Missing credentials. Please try again."));
          return;
        }

        // Save credentials
        setToken(token);
        if (refreshToken) setRefreshToken(refreshToken);
        updateConfig({ userId });

        // Show success page in browser
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(successPage(true, `Logged in as ${email}`));

        if (isJsonMode()) {
          printResult({
            userId,
            email: email ?? "(unknown)",
            displayName: displayName ?? "(not set)",
          });
        } else {
          console.log(`\nLogged in as ${email} (${userId})`);
        }

        // Close server after delay (let browser render the page)
        setTimeout(() => {
          server.close();
          resolve();
        }, 2000);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    // Listen on random port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start callback server"));
        return;
      }

      const port = addr.port;
      // Open browser to LOCAL server first (HTTP), which redirects to BotsChat (HTTPS)
      const startUrl = `http://127.0.0.1:${port}/start`;

      if (autoOpen) {
        console.log("Opening browser for login...");

        const cmd =
          process.platform === "darwin"
            ? `open "${startUrl}"`
            : process.platform === "win32"
              ? `start "" "${startUrl}"`
              : `xdg-open "${startUrl}"`;

        exec(cmd, (err) => {
          if (err) {
            console.log(
              `Couldn't open browser automatically.`,
            );
          }
        });
      }

      console.log(`Login URL: ${startUrl}`);
      console.log("Waiting for login...");

      const timeout = setTimeout(() => {
        server.close();
        reject(new Error("Login timed out (5 minutes). Please try again."));
      }, 5 * 60 * 1000);

      server.on("close", () => clearTimeout(timeout));
    });
  });
}

function successPage(ok: boolean, message: string): string {
  const icon = ok ? "&#10003;" : "&#10007;";
  const color = ok ? "#22c55e" : "#ef4444";
  return `<!DOCTYPE html>
<html><head><title>BotsChat CLI</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;background:#1a1a2e;color:#e0e0e0">
  <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px;color:${color}">${icon}</div>
    <h2>${ok ? "CLI Login Successful" : "Login Failed"}</h2>
    <p style="color:#888;margin-top:8px">${message}</p>
    <p style="color:#666;margin-top:16px;font-size:14px">You can close this tab and return to the terminal.</p>
  </div>
</body></html>`;
}
