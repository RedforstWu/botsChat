import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { loadConfig, updateConfig } from "../lib/config.js";
import { getToken, channelsApi, sessionsApi } from "../lib/api-client.js";
import { BotsChatWSClient, type WSMessage } from "../lib/ws-client.js";
import { E2eService } from "../lib/e2e.js";
import { printJson, printError, printInfo, isJsonMode } from "../lib/output.js";

export const chatCmd = new Command("chat")
  .description("Chat with an AI agent")
  .argument("[message]", "Message to send (omit for interactive mode)")
  .option("-i, --interactive", "Interactive REPL mode")
  .option("-s, --session <sessionId>", "Session ID")
  .option("-c, --channel <channelId>", "Channel ID")
  .option("-a, --agent <agentId>", "Agent ID")
  .option("--no-stream", "Wait for full response instead of streaming")
  .option("--async", "Send message and exit immediately without waiting for response")
  .option("--pipe", "Read message from stdin")
  .option("--timeout <seconds>", "Timeout in seconds for single-shot mode", "300")
  .action(async (message: string | undefined, opts) => {
    try {
      const cfg = loadConfig();
      if (!cfg.userId || !cfg.token) {
        printError("Not logged in. Run 'botschat login' first.");
        process.exit(1);
      }

      // Read from stdin if --pipe
      if (opts.pipe) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        message = Buffer.concat(chunks).toString("utf-8").trim();
      }

      const interactive = opts.interactive || !message;

      // Resolve channel and session
      let channelId = opts.channel || cfg.defaultChannel;
      let sessionId = opts.session || cfg.defaultSession;

      if (!channelId || !sessionId) {
        const { channels } = await channelsApi.list();
        if (channels.length === 0) {
          printError("No channels found. Create one first.");
          process.exit(1);
        }
        if (!channelId) {
          channelId = channels[0].id;
          updateConfig({ defaultChannel: channelId });
        }

        if (!sessionId) {
          const { sessions } = await sessionsApi.list(channelId);
          if (sessions.length === 0) {
            const session = await sessionsApi.create(channelId);
            sessionId = session.sessionKey;
          } else {
            sessionId = sessions[0].sessionKey;
          }
          updateConfig({ defaultSession: sessionId });
        }
      }

      // Build WS URL
      const wsProtocol = cfg.url.startsWith("https") ? "wss" : "ws";
      const wsHost = cfg.url.replace(/^https?:\/\//, "");
      const wsUrl = `${wsProtocol}://${wsHost}/api/ws/${cfg.userId}/${encodeURIComponent(sessionId!)}`;

      const timeoutMs = parseFloat(opts.timeout) * 1000;

      if (interactive) {
        await runInteractive(wsUrl, sessionId!, opts.agent, cfg.userId);
      } else if (opts.async) {
        await runAsync(wsUrl, sessionId!, message!, opts.agent);
      } else {
        await runSingleShot(
          wsUrl,
          sessionId!,
          message!,
          opts.agent,
          timeoutMs,
          opts.stream !== false,
        );
      }
    } catch (err) {
      printError(String((err as Error).message));
      process.exit(1);
    }
  });

/** Send message and wait for response. */
async function runSingleShot(
  wsUrl: string,
  sessionKey: string,
  message: string,
  agentId?: string,
  timeout = 300000,
  stream = true,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let fullText = "";
    let streaming = false;
    let timer: ReturnType<typeof setTimeout>;

    const ws = new BotsChatWSClient({
      url: wsUrl,
      getToken,
      noReconnect: true,
      onStatusChange: async (connected) => {
        if (connected) {
          const msg: WSMessage = {
            type: "user.message",
            sessionKey,
            text: message,
            messageId: randomUUID(),
          };
          if (agentId) msg.targetAgentId = agentId;
          await ws.send(msg);

          timer = setTimeout(() => {
            ws.disconnect();
            reject(new Error("Timeout waiting for response"));
          }, timeout);
        }
      },
      onMessage: (msg) => {
        if (msg.type === "auth.fail") {
          ws.disconnect();
          reject(new Error(`Auth failed: ${msg.reason}`));
          return;
        }

        if (stream) {
          if (msg.type === "agent.stream.start") {
            streaming = true;
          } else if (msg.type === "agent.stream.chunk" && streaming) {
            const text = msg.text as string;
            if (text) {
              process.stdout.write(text);
              fullText += text;
            }
          } else if (msg.type === "agent.stream.end" && streaming) {
            process.stdout.write("\n");
            clearTimeout(timer);
            ws.disconnect();
            resolve();
            return;
          } else if (msg.type === "agent.activity") {
            const text = msg.text as string;
            if (text) {
              printInfo(`[${msg.kind}] ${text}`);
            }
          }
        }

        if (msg.type === "agent.text") {
          clearTimeout(timer);
          if (!streaming) {
            const text = msg.text as string;
            if (isJsonMode()) {
              printJson(msg);
            } else {
              console.log(text);
            }
          }
          ws.disconnect();
          resolve();
        }
      },
    });

    ws.connect();
  });
}

/** Send message and exit immediately — don't wait for response. */
async function runAsync(
  wsUrl: string,
  sessionKey: string,
  message: string,
  agentId?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const messageId = randomUUID();

    const ws = new BotsChatWSClient({
      url: wsUrl,
      getToken,
      noReconnect: true,
      onStatusChange: async (connected) => {
        if (connected) {
          const msg: WSMessage = {
            type: "user.message",
            sessionKey,
            text: message,
            messageId,
          };
          if (agentId) msg.targetAgentId = agentId;
          await ws.send(msg);

          if (isJsonMode()) {
            printJson({ sent: true, messageId, sessionKey });
          } else {
            console.log(`Message sent (id: ${messageId})`);
          }

          // Brief delay to ensure message is flushed over WS
          setTimeout(() => {
            ws.disconnect();
            resolve();
          }, 500);
        }
      },
      onMessage: () => {
        // Ignore responses in async mode
      },
    });

    ws.connect();

    // Timeout for connection
    setTimeout(() => {
      ws.disconnect();
      reject(new Error("Timeout connecting to server"));
    }, 15000);
  });
}

async function runInteractive(
  wsUrl: string,
  sessionKey: string,
  agentId?: string,
  userId?: string,
): Promise<void> {
  return new Promise((resolve) => {
    let streaming = false;

    const ws = new BotsChatWSClient({
      url: wsUrl,
      getToken,
      onStatusChange: (connected) => {
        if (connected) {
          printInfo("Connected. Type your message (Ctrl+C to exit).\n");
          startRepl();
        } else {
          printInfo("Disconnected. Reconnecting...");
        }
      },
      onMessage: (msg) => {
        if (msg.type === "agent.stream.start") {
          streaming = true;
        } else if (msg.type === "agent.stream.chunk" && streaming) {
          const text = msg.text as string;
          if (text) process.stdout.write(text);
        } else if (msg.type === "agent.stream.end" && streaming) {
          streaming = false;
          process.stdout.write("\n\n");
        } else if (msg.type === "agent.activity") {
          const text = msg.text as string;
          if (text) printInfo(`[${msg.kind}] ${text}`);
        } else if (msg.type === "agent.text") {
          if (!streaming) {
            if (isJsonMode()) {
              printJson(msg);
            } else {
              console.log(`${msg.text}\n`);
            }
          }
        }
      },
    });

    ws.connect();

    function startRepl() {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "> ",
      });

      rl.prompt();

      rl.on("line", async (line) => {
        const text = line.trim();
        if (!text) {
          rl.prompt();
          return;
        }

        if (text === "/quit" || text === "/exit") {
          ws.disconnect();
          rl.close();
          resolve();
          return;
        }

        const msg: WSMessage = {
          type: "user.message",
          sessionKey,
          text,
          messageId: randomUUID(),
        };
        if (agentId) msg.targetAgentId = agentId;
        await ws.send(msg);

        const waitForResponse = () => {
          const origOnMsg = ws["opts"].onMessage;
          ws["opts"].onMessage = (m) => {
            origOnMsg(m);
            if (
              m.type === "agent.text" ||
              m.type === "agent.stream.end"
            ) {
              ws["opts"].onMessage = origOnMsg;
              rl.prompt();
            }
          };
        };
        waitForResponse();
      });

      rl.on("close", () => {
        ws.disconnect();
        resolve();
      });
    }
  });
}
