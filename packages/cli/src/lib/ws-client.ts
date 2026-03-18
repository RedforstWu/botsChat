/**
 * WebSocket client — adapted from packages/web/src/ws.ts.
 * Uses the `ws` npm package instead of browser WebSocket.
 */
import WebSocket from "ws";
import { E2eService } from "./e2e.js";
import { getToken, tryRefreshAccessToken } from "./api-client.js";

export type WSMessage = {
  type: string;
  [key: string]: unknown;
};

export type WSClientOptions = {
  url: string; // full WS URL: ws(s)://host/api/ws/:userId/:sessionId
  getToken: () => string | null;
  onMessage: (msg: WSMessage) => void;
  onStatusChange: (connected: boolean) => void;
  /** Disable auto-reconnect (for single-shot mode). */
  noReconnect?: boolean;
};

export class BotsChatWSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private intentionalClose = false;
  private _connected = false;

  constructor(private opts: WSClientOptions) {}

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.intentionalClose = false;

    this.ws = new WebSocket(this.opts.url);

    this.ws.on("open", () => {
      const token = this.opts.getToken();
      if (!token) {
        this.ws?.close();
        return;
      }
      this.ws!.send(JSON.stringify({ type: "auth", token }));
    });

    this.ws.on("message", async (data) => {
      try {
        const raw =
          typeof data === "string" ? data : (data as Buffer).toString("utf-8");
        const msg = JSON.parse(raw) as WSMessage;

        // E2E decryption
        if (msg.encrypted && E2eService.hasKey()) {
          try {
            if (
              msg.type === "agent.text" ||
              msg.type === "agent.media"
            ) {
              const text = msg.text as string | undefined;
              const messageId = msg.messageId as string;
              if (text && messageId) {
                msg.text = await E2eService.decrypt(text, messageId);
                msg.encrypted = false;
              }
            } else if (msg.type === "job.update") {
              const summary = msg.summary as string;
              const jobId = msg.jobId as string;
              if (summary && jobId) {
                msg.summary = await E2eService.decrypt(summary, jobId);
                msg.encrypted = false;
              }
            }
          } catch {
            msg.decryptionError = true;
          }
        }

        // Decrypt stream chunks
        if (
          msg.type === "agent.stream.chunk" &&
          msg.encrypted &&
          msg.chunkId &&
          E2eService.hasKey()
        ) {
          try {
            msg.text = await E2eService.decrypt(
              msg.text as string,
              msg.chunkId as string,
            );
            msg.encrypted = false;
          } catch {
            /* ignore */
          }
        }

        // Decrypt activity
        if (
          msg.type === "agent.activity" &&
          msg.encrypted &&
          msg.activityId &&
          E2eService.hasKey()
        ) {
          try {
            msg.text = await E2eService.decrypt(
              msg.text as string,
              msg.activityId as string,
            );
            msg.encrypted = false;
          } catch {
            /* ignore */
          }
        }

        // Decrypt task scan results
        if (
          msg.type === "task.scan.result" &&
          Array.isArray(msg.tasks) &&
          E2eService.hasKey()
        ) {
          for (const t of msg.tasks as Record<string, unknown>[]) {
            if (t.encrypted && t.iv) {
              try {
                if (t.schedule)
                  t.schedule = await E2eService.decrypt(
                    t.schedule as string,
                    t.iv as string,
                  );
                if (t.instructions)
                  t.instructions = await E2eService.decrypt(
                    t.instructions as string,
                    t.iv as string,
                  );
                t.encrypted = false;
              } catch {
                t.decryptionError = true;
              }
            }
          }
        }

        if (msg.type === "auth.ok") {
          this.backoffMs = 1000;
          this._connected = true;
          this.opts.onStatusChange(true);
        } else if (msg.type === "auth.fail") {
          this.intentionalClose = true;
          this.ws?.close();
          this.opts.onMessage(msg);
        } else {
          this.opts.onMessage(msg);
        }
      } catch {
        /* ignore malformed messages */
      }
    });

    this.ws.on("close", (code) => {
      this._connected = false;
      this.opts.onStatusChange(false);
      if (!this.intentionalClose && !this.opts.noReconnect) {
        const isAuthFail = code === 4001;
        this.reconnectTimer = setTimeout(async () => {
          this.backoffMs = Math.min(this.backoffMs * 2, 30000);
          if (isAuthFail) {
            const ok = await tryRefreshAccessToken();
            if (ok) this.backoffMs = 1000;
          }
          this.connect();
        }, this.backoffMs);
      }
    });

    this.ws.on("error", () => {
      /* close event will follow */
    });
  }

  async send(msg: WSMessage): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // E2E encrypt user messages
      if (
        msg.type === "user.message" &&
        E2eService.hasKey() &&
        typeof msg.text === "string"
      ) {
        try {
          const existingId = (msg.messageId as string) || undefined;
          const { ciphertext, messageId } = await E2eService.encrypt(
            msg.text,
            existingId,
          );
          msg.text = ciphertext;
          if (!existingId) msg.messageId = messageId;
          msg.encrypted = true;
        } catch {
          return;
        }
      }
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }
}
