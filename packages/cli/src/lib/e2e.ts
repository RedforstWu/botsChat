/**
 * E2E service — adapted from packages/web/src/e2e.ts.
 * Uses file-based config instead of localStorage.
 */
import {
  deriveKey,
  encryptText,
  decryptText,
  toBase64,
  fromBase64,
} from "e2e-crypto";
import { randomUUID } from "node:crypto";
import { loadConfig, updateConfig } from "./config.js";

let currentKey: Uint8Array | null = null;
let currentPassword: string | null = null;

/** Try to restore cached key from config (synchronous, no PBKDF2). */
export function initE2eFromConfig(): void {
  try {
    const cfg = loadConfig();
    if (cfg.e2eKeyBase64) {
      currentKey = fromBase64(cfg.e2eKeyBase64);
      currentPassword = cfg.e2ePassword;
    }
  } catch {
    /* ignore */
  }
}

export const E2eService = {
  async setPassword(
    password: string,
    userId: string,
    remember = true,
  ): Promise<void> {
    if (!password) {
      currentKey = null;
      currentPassword = null;
      updateConfig({ e2ePassword: null, e2eKeyBase64: null });
      return;
    }
    currentKey = await deriveKey(password, userId);
    currentPassword = password;
    if (remember) {
      updateConfig({
        e2ePassword: password,
        e2eKeyBase64: toBase64(currentKey),
      });
    }
  },

  clear(): void {
    currentKey = null;
    currentPassword = null;
    updateConfig({ e2ePassword: null, e2eKeyBase64: null });
  },

  hasKey(): boolean {
    return !!currentKey;
  },

  getPassword(): string | null {
    return currentPassword;
  },

  async loadSavedPassword(userId: string): Promise<boolean> {
    if (currentKey) return true;
    const cfg = loadConfig();
    if (!cfg.e2ePassword) return false;
    try {
      await this.setPassword(cfg.e2ePassword, userId, true);
      return true;
    } catch {
      return false;
    }
  },

  async encrypt(
    text: string,
    contextId?: string,
  ): Promise<{ ciphertext: string; messageId: string }> {
    if (!currentKey) throw new Error("E2E key not set");
    const messageId = contextId || randomUUID();
    const encrypted = await encryptText(currentKey, text, messageId);
    return { ciphertext: toBase64(encrypted), messageId };
  },

  async decrypt(
    ciphertextBase64: string,
    messageId: string,
  ): Promise<string> {
    if (!currentKey) throw new Error("E2E key not set");
    const ciphertext = fromBase64(ciphertextBase64);
    return decryptText(currentKey, ciphertext, messageId);
  },
};
