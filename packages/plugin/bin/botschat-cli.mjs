#!/usr/bin/env node

// src/index.ts
import { Command as Command15 } from "commander";

// src/lib/config.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var CONFIG_DIR = join(homedir(), ".botschat");
var CONFIG_FILE = join(CONFIG_DIR, "config.json");
var DEFAULT_CONFIG = {
  url: "https://console.botschat.app",
  token: null,
  refreshToken: null,
  userId: null,
  e2ePassword: null,
  e2eKeyBase64: null,
  defaultChannel: null,
  defaultSession: null
};
var _configPath = CONFIG_FILE;
function setConfigPath(path) {
  _configPath = path;
}
function loadConfig() {
  try {
    if (existsSync(_configPath)) {
      const raw = readFileSync(_configPath, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
  }
  return { ...DEFAULT_CONFIG };
}
function saveConfig(config) {
  const dir = _configPath === CONFIG_FILE ? CONFIG_DIR : join(_configPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 448 });
  }
  writeFileSync(_configPath, JSON.stringify(config, null, 2) + "\n", {
    mode: 384
  });
}
function updateConfig(partial) {
  const config = loadConfig();
  Object.assign(config, partial);
  saveConfig(config);
  return config;
}

// src/lib/output.ts
var _jsonMode = false;
function setJsonMode(on) {
  _jsonMode = on;
}
function isJsonMode() {
  return _jsonMode;
}
function printJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function printError(msg) {
  process.stderr.write(`Error: ${msg}
`);
}
function printInfo(msg) {
  process.stderr.write(`${msg}
`);
}
function printTable(rows, columns) {
  if (_jsonMode) {
    printJson(rows);
    return;
  }
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  const widths = columns.map((col) => {
    const maxData = rows.reduce(
      (max, row) => Math.max(max, String(row[col.key] ?? "").length),
      0
    );
    return col.width ?? Math.max(col.label.length, Math.min(maxData, 60));
  });
  const header = columns.map((col, i) => col.label.padEnd(widths[i])).join("  ");
  console.log(header);
  console.log(columns.map((_, i) => "\u2500".repeat(widths[i])).join("  "));
  for (const row of rows) {
    const line = columns.map((col, i) => {
      const val = String(row[col.key] ?? "");
      return val.length > widths[i] ? val.slice(0, widths[i] - 1) + "\u2026" : val.padEnd(widths[i]);
    }).join("  ");
    console.log(line);
  }
}
function printResult(data) {
  if (_jsonMode) {
    printJson(data);
    return;
  }
  const maxKey = Math.max(...Object.keys(data).map((k) => k.length));
  for (const [key, val] of Object.entries(data)) {
    console.log(`${key.padEnd(maxKey)}  ${val}`);
  }
}

// src/lib/api-client.ts
var _token = null;
var _refreshToken = null;
var _apiBase = "";
function initApiClient() {
  const cfg = loadConfig();
  _token = cfg.token;
  _refreshToken = cfg.refreshToken;
  _apiBase = `${cfg.url}/api`;
}
function setToken(token) {
  _token = token;
  updateConfig({ token });
}
function setRefreshToken(token) {
  _refreshToken = token;
  updateConfig({ refreshToken: token });
}
function getToken() {
  return _token;
}
function setApiBase(url) {
  _apiBase = `${url.replace(/\/+$/, "")}/api`;
}
async function tryRefreshAccessToken() {
  if (!_refreshToken) return false;
  try {
    const res = await fetch(`${_apiBase}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: _refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    _token = data.token;
    updateConfig({ token: data.token });
    return true;
  } catch {
    return false;
  }
}
async function request(method, path, body) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  let res;
  try {
    res = await fetch(`${_apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : void 0
    });
  } catch (err) {
    throw new Error(`Network error: ${err}`);
  }
  if (res.status === 401 && _refreshToken && !path.includes("/auth/refresh")) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${_token}`;
      try {
        res = await fetch(`${_apiBase}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : void 0
        });
      } catch (err) {
        throw new Error(`Network error on retry: ${err}`);
      }
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message = err.error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return await res.json();
}
var authApi = {
  register: (email, password, displayName) => request("POST", "/auth/register", {
    email,
    password,
    displayName
  }),
  login: (email, password) => request("POST", "/auth/login", { email, password }),
  me: () => request("GET", "/me")
};
var devAuthApi = {
  login: (secret, userId) => request("POST", "/dev-auth/login", {
    secret,
    userId: userId ?? "dev-test-user"
  })
};
var meApi = {
  updateSettings: (data) => request("PATCH", "/me", data)
};
var modelsApi = {
  list: () => request("GET", "/models")
};
var channelsApi = {
  list: () => request("GET", "/channels"),
  get: (id) => request("GET", `/channels/${id}`),
  create: (data) => request("POST", "/channels", data),
  update: (id, data) => request("PATCH", `/channels/${id}`, data),
  delete: (id) => request("DELETE", `/channels/${id}`)
};
var sessionsApi = {
  list: (channelId) => request(
    "GET",
    `/channels/${channelId}/sessions`
  ),
  create: (channelId, name) => request("POST", `/channels/${channelId}/sessions`, { name }),
  rename: (channelId, sessionId, name) => request(
    "PATCH",
    `/channels/${channelId}/sessions/${sessionId}`,
    { name }
  ),
  delete: (channelId, sessionId) => request(
    "DELETE",
    `/channels/${channelId}/sessions/${sessionId}`
  )
};
var tasksApi = {
  list: (channelId) => request("GET", `/channels/${channelId}/tasks`),
  listAll: (kind = "background") => request("GET", `/tasks?kind=${kind}`),
  scanData: () => request("GET", "/task-scan"),
  create: (channelId, data) => request("POST", `/channels/${channelId}/tasks`, data),
  update: (channelId, taskId, data) => request(
    "PATCH",
    `/channels/${channelId}/tasks/${taskId}`,
    data
  ),
  delete: (channelId, taskId) => request(
    "DELETE",
    `/channels/${channelId}/tasks/${taskId}`
  ),
  run: (channelId, taskId) => request(
    "POST",
    `/channels/${channelId}/tasks/${taskId}/run`
  )
};
var jobsApi = {
  list: (channelId, taskId) => request(
    "GET",
    `/channels/${channelId}/tasks/${taskId}/jobs`
  ),
  listByTask: (taskId) => request("GET", `/tasks/${taskId}/jobs`)
};
var messagesApi = {
  list: (userId, sessionKey, threadId) => request(
    "GET",
    `/messages/${userId}?sessionKey=${encodeURIComponent(sessionKey)}${threadId ? `&threadId=${encodeURIComponent(threadId)}` : ""}`
  )
};
var pairingApi = {
  list: () => request("GET", "/pairing-tokens"),
  create: (label) => request(
    "POST",
    "/pairing-tokens",
    { label }
  ),
  delete: (id) => request("DELETE", `/pairing-tokens/${id}`)
};
var setupApi = {
  init: (data) => request("POST", "/setup/init", data),
  cloudUrl: () => request(
    "GET",
    "/setup/cloud-url"
  )
};
var connectionApi = {
  status: (userId) => request(
    "GET",
    `/connection/${userId}/status`
  )
};

// ../e2e-crypto/e2e-crypto.ts
var isNode = typeof globalThis.process !== "undefined" && typeof globalThis.process.versions?.node === "string";
var PBKDF2_ITERATIONS = 31e4;
var KEY_LENGTH = 32;
var NONCE_LENGTH = 16;
var SALT_PREFIX = "botschat-e2e:";
function utf8Encode(str) {
  return new TextEncoder().encode(str);
}
function utf8Decode(buf) {
  return new TextDecoder().decode(buf);
}
async function deriveKeyWeb(password, userId) {
  const enc = utf8Encode(password);
  const salt = utf8Encode(SALT_PREFIX + userId);
  const baseKey = await crypto.subtle.importKey("raw", enc.buffer, "PBKDF2", false, [
    "deriveBits"
  ]);
  const saltArr = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltArr).set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltArr, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    KEY_LENGTH * 8
  );
  return new Uint8Array(bits);
}
async function hkdfNonceWeb(key, contextId) {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key.buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const info = utf8Encode("nonce-" + contextId);
  const input = new Uint8Array(info.length + 1);
  input.set(info);
  input[info.length] = 1;
  const full = await crypto.subtle.sign("HMAC", hmacKey, input.buffer);
  return new Uint8Array(full).slice(0, NONCE_LENGTH);
}
async function encryptWeb(key, plaintext, contextId) {
  const counter = await hkdfNonceWeb(key, contextId);
  const aesKey = await crypto.subtle.importKey(
    "raw",
    key.buffer,
    { name: "AES-CTR" },
    false,
    ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CTR", counter: new Uint8Array(counter).buffer, length: 128 },
    aesKey,
    plaintext.buffer
  );
  return new Uint8Array(ciphertext);
}
async function decryptWeb(key, ciphertext, contextId) {
  const counter = await hkdfNonceWeb(key, contextId);
  const aesKey = await crypto.subtle.importKey(
    "raw",
    key.buffer,
    { name: "AES-CTR" },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: new Uint8Array(counter).buffer, length: 128 },
    aesKey,
    ciphertext.buffer
  );
  return new Uint8Array(plaintext);
}
var _nodeCrypto = null;
var _nodeUtil = null;
var _g = globalThis;
if (isNode && _g.__e2e_nodeCrypto) {
  _nodeCrypto = _g.__e2e_nodeCrypto;
  _nodeUtil = _g.__e2e_nodeUtil;
}
async function ensureNodeModules() {
  if (_nodeCrypto && _nodeUtil) return;
  _nodeCrypto = await import("crypto");
  _nodeUtil = await import("util");
  _g.__e2e_nodeCrypto = _nodeCrypto;
  _g.__e2e_nodeUtil = _nodeUtil;
}
async function deriveKeyNode(password, userId) {
  await ensureNodeModules();
  const pbkdf2Async = _nodeUtil.promisify(_nodeCrypto.pbkdf2);
  const salt = SALT_PREFIX + userId;
  const buf = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  return new Uint8Array(buf);
}
async function hkdfNonceNode(key, contextId) {
  await ensureNodeModules();
  const info = utf8Encode("nonce-" + contextId);
  const input = new Uint8Array(info.length + 1);
  input.set(info);
  input[info.length] = 1;
  const hmac = _nodeCrypto.createHmac("sha256", Buffer.from(key));
  hmac.update(Buffer.from(input));
  const full = hmac.digest();
  return new Uint8Array(full.buffer, full.byteOffset, NONCE_LENGTH);
}
async function encryptNode(key, plaintext, contextId) {
  await ensureNodeModules();
  const iv = await hkdfNonceNode(key, contextId);
  const cipher = _nodeCrypto.createCipheriv(
    "aes-256-ctr",
    Buffer.from(key),
    Buffer.from(iv)
  );
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  return new Uint8Array(encrypted);
}
async function decryptNode(key, ciphertext, contextId) {
  await ensureNodeModules();
  const iv = await hkdfNonceNode(key, contextId);
  const decipher = _nodeCrypto.createDecipheriv(
    "aes-256-ctr",
    Buffer.from(key),
    Buffer.from(iv)
  );
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  return new Uint8Array(decrypted);
}
async function deriveKey(password, userId) {
  return isNode ? deriveKeyNode(password, userId) : deriveKeyWeb(password, userId);
}
async function encryptText(key, plaintext, contextId) {
  const data = utf8Encode(plaintext);
  return isNode ? encryptNode(key, data, contextId) : encryptWeb(key, data, contextId);
}
async function decryptText(key, ciphertext, contextId) {
  const data = isNode ? await decryptNode(key, ciphertext, contextId) : await decryptWeb(key, ciphertext, contextId);
  return utf8Decode(data);
}
function toBase64(data) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
function fromBase64(b64) {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// src/lib/e2e.ts
import { randomUUID } from "crypto";
var currentKey = null;
var currentPassword = null;
function initE2eFromConfig() {
  try {
    const cfg = loadConfig();
    if (cfg.e2eKeyBase64) {
      currentKey = fromBase64(cfg.e2eKeyBase64);
      currentPassword = cfg.e2ePassword;
    }
  } catch {
  }
}
var E2eService = {
  async setPassword(password, userId, remember = true) {
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
        e2eKeyBase64: toBase64(currentKey)
      });
    }
  },
  clear() {
    currentKey = null;
    currentPassword = null;
    updateConfig({ e2ePassword: null, e2eKeyBase64: null });
  },
  hasKey() {
    return !!currentKey;
  },
  getPassword() {
    return currentPassword;
  },
  async loadSavedPassword(userId) {
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
  async encrypt(text, contextId) {
    if (!currentKey) throw new Error("E2E key not set");
    const messageId = contextId || randomUUID();
    const encrypted = await encryptText(currentKey, text, messageId);
    return { ciphertext: toBase64(encrypted), messageId };
  },
  async decrypt(ciphertextBase64, messageId) {
    if (!currentKey) throw new Error("E2E key not set");
    const ciphertext = fromBase64(ciphertextBase64);
    return decryptText(currentKey, ciphertext, messageId);
  }
};

// src/commands/login.ts
import { Command } from "commander";
import { createServer } from "http";
import { randomUUID as randomUUID2 } from "crypto";
import { exec } from "child_process";
var loginCmd = new Command("login").description("Authenticate with BotsChat server").option("--dev", "Use dev auth (local development)").option("--secret <secret>", "Dev auth secret").option("--user <userId>", "Dev auth user ID", "dev-test-user").option("--email <email>", "Email for login").option("--password <password>", "Password for login").option("--no-open", "Print login URL instead of opening browser").action(async (opts) => {
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
    printError(String(err.message));
    process.exit(1);
  }
});
async function browserLogin(autoOpen = true) {
  const cfg = loadConfig();
  const state = randomUUID2();
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/start") {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        const loginUrl = `${cfg.url}/?cli_port=${port}&cli_state=${encodeURIComponent(state)}`;
        res.writeHead(302, { Location: loginUrl });
        res.end();
        return;
      }
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
        setToken(token);
        if (refreshToken) setRefreshToken(refreshToken);
        updateConfig({ userId });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(successPage(true, `Logged in as ${email}`));
        if (isJsonMode()) {
          printResult({
            userId,
            email: email ?? "(unknown)",
            displayName: displayName ?? "(not set)"
          });
        } else {
          console.log(`
Logged in as ${email} (${userId})`);
        }
        setTimeout(() => {
          server.close();
          resolve();
        }, 2e3);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start callback server"));
        return;
      }
      const port = addr.port;
      const startUrl = `http://127.0.0.1:${port}/start`;
      if (autoOpen) {
        console.log("Opening browser for login...");
        const cmd = process.platform === "darwin" ? `open "${startUrl}"` : process.platform === "win32" ? `start "" "${startUrl}"` : `xdg-open "${startUrl}"`;
        exec(cmd, (err) => {
          if (err) {
            console.log(
              `Couldn't open browser automatically.`
            );
          }
        });
      }
      console.log(`Login URL: ${startUrl}`);
      console.log("Waiting for login...");
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error("Login timed out (5 minutes). Please try again."));
      }, 5 * 60 * 1e3);
      server.on("close", () => clearTimeout(timeout));
    });
  });
}
function successPage(ok, message) {
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

// src/commands/logout.ts
import { Command as Command2 } from "commander";
var logoutCmd = new Command2("logout").description("Clear authentication tokens").action(() => {
  updateConfig({
    token: null,
    refreshToken: null,
    userId: null
  });
  console.log("Logged out.");
});

// src/commands/whoami.ts
import { Command as Command3 } from "commander";
var whoamiCmd = new Command3("whoami").description("Show current user info").action(async () => {
  try {
    const me = await authApi.me();
    printResult({
      id: me.id,
      email: me.email,
      displayName: me.displayName ?? "(not set)",
      defaultModel: me.settings.defaultModel ?? "(not set)"
    });
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/channels.ts
import { Command as Command4 } from "commander";
var channelsCmd = new Command4("channels").description("Manage channels").action(async () => {
  try {
    const { channels } = await channelsApi.list();
    printTable(
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        agent: c.openclawAgentId,
        updated: new Date(c.updatedAt).toLocaleString()
      })),
      [
        { key: "id", label: "ID", width: 20 },
        { key: "name", label: "Name", width: 20 },
        { key: "agent", label: "Agent", width: 15 },
        { key: "updated", label: "Updated", width: 20 }
      ]
    );
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
channelsCmd.command("show <id>").description("Show channel details").action(async (id) => {
  try {
    const ch = await channelsApi.get(id);
    printResult({
      id: ch.id,
      name: ch.name,
      description: ch.description || "(none)",
      openclawAgentId: ch.openclawAgentId,
      systemPrompt: ch.systemPrompt || "(none)",
      createdAt: new Date(ch.createdAt).toLocaleString(),
      updatedAt: new Date(ch.updatedAt).toLocaleString()
    });
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
channelsCmd.command("create <name>").description("Create a new channel").option("--description <desc>", "Channel description").option("--agent-id <agentId>", "OpenClaw agent ID").option("--system-prompt <prompt>", "System prompt").action(async (name, opts) => {
  try {
    const ch = await channelsApi.create({
      name,
      description: opts.description,
      openclawAgentId: opts.agentId,
      systemPrompt: opts.systemPrompt
    });
    if (isJsonMode()) {
      printJson(ch);
    } else {
      console.log(`Channel created: ${ch.id} (${ch.name})`);
    }
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
channelsCmd.command("update <id>").description("Update a channel").option("--name <name>", "New name").option("--description <desc>", "New description").option("--system-prompt <prompt>", "New system prompt").action(async (id, opts) => {
  try {
    const data = {};
    if (opts.name) data.name = opts.name;
    if (opts.description) data.description = opts.description;
    if (opts.systemPrompt) data.systemPrompt = opts.systemPrompt;
    await channelsApi.update(id, data);
    console.log("Channel updated.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
channelsCmd.command("delete <id>").description("Delete a channel").option("-y, --yes", "Skip confirmation").action(async (id, opts) => {
  try {
    if (!opts.yes) {
      const { createInterface: createInterface2 } = await import("readline/promises");
      const rl = createInterface2({
        input: process.stdin,
        output: process.stderr
      });
      const answer = await rl.question(
        `Delete channel ${id}? [y/N] `
      );
      rl.close();
      if (answer.toLowerCase() !== "y") {
        console.log("Cancelled.");
        return;
      }
    }
    await channelsApi.delete(id);
    console.log("Channel deleted.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/sessions.ts
import { Command as Command5 } from "commander";
var sessionsCmd = new Command5("sessions").description("Manage sessions").argument("<channelId>", "Channel ID").action(async (channelId) => {
  try {
    const { sessions } = await sessionsApi.list(channelId);
    printTable(
      sessions.map((s) => ({
        id: s.id,
        name: s.name,
        sessionKey: s.sessionKey,
        updated: new Date(s.updatedAt).toLocaleString()
      })),
      [
        { key: "id", label: "ID", width: 20 },
        { key: "name", label: "Name", width: 25 },
        { key: "sessionKey", label: "Session Key", width: 40 },
        { key: "updated", label: "Updated", width: 20 }
      ]
    );
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
sessionsCmd.command("create <channelId>").description("Create a new session").option("--name <name>", "Session name").action(async (channelId, opts) => {
  try {
    const session = await sessionsApi.create(channelId, opts.name);
    if (isJsonMode()) {
      printJson(session);
    } else {
      console.log(
        `Session created: ${session.id} (key: ${session.sessionKey})`
      );
    }
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
sessionsCmd.command("rename <channelId> <sessionId> <name>").description("Rename a session").action(async (channelId, sessionId, name) => {
  try {
    await sessionsApi.rename(channelId, sessionId, name);
    console.log("Session renamed.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
sessionsCmd.command("delete <channelId> <sessionId>").description("Delete a session").option("-y, --yes", "Skip confirmation").action(async (channelId, sessionId, opts) => {
  try {
    if (!opts.yes) {
      const { createInterface: createInterface2 } = await import("readline/promises");
      const rl = createInterface2({
        input: process.stdin,
        output: process.stderr
      });
      const answer = await rl.question(
        `Delete session ${sessionId}? [y/N] `
      );
      rl.close();
      if (answer.toLowerCase() !== "y") {
        console.log("Cancelled.");
        return;
      }
    }
    await sessionsApi.delete(channelId, sessionId);
    console.log("Session deleted.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/tokens.ts
import { Command as Command6 } from "commander";
var tokensCmd = new Command6("tokens").description("Manage pairing tokens").action(async () => {
  try {
    const { tokens } = await pairingApi.list();
    printTable(
      tokens.map((t) => ({
        id: t.id,
        preview: t.tokenPreview,
        label: t.label ?? "",
        lastConnected: t.lastConnectedAt ? new Date(t.lastConnectedAt).toLocaleString() : "never",
        created: new Date(t.createdAt).toLocaleString()
      })),
      [
        { key: "id", label: "ID", width: 20 },
        { key: "preview", label: "Token", width: 20 },
        { key: "label", label: "Label", width: 15 },
        { key: "lastConnected", label: "Last Connected", width: 20 },
        { key: "created", label: "Created", width: 20 }
      ]
    );
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tokensCmd.command("create").description("Create a new pairing token").option("--label <label>", "Token label").action(async (opts) => {
  try {
    const result = await pairingApi.create(opts.label);
    if (isJsonMode()) {
      printJson(result);
    } else {
      console.log(`Token created: ${result.token}`);
      console.log(`ID: ${result.id}`);
    }
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tokensCmd.command("delete <id>").description("Revoke a pairing token").action(async (id) => {
  try {
    await pairingApi.delete(id);
    console.log("Token revoked.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/models.ts
import { Command as Command7 } from "commander";
var modelsCmd = new Command7("models").description("Manage models").action(async () => {
  try {
    const { models } = await modelsApi.list();
    printTable(
      models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider
      })),
      [
        { key: "id", label: "ID", width: 35 },
        { key: "name", label: "Name", width: 25 },
        { key: "provider", label: "Provider", width: 20 }
      ]
    );
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
modelsCmd.command("set <modelId>").description("Set default model").action(async (modelId) => {
  try {
    await meApi.updateSettings({ defaultModel: modelId });
    console.log(`Default model set to: ${modelId}`);
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/status.ts
import { Command as Command8 } from "commander";
var statusCmd = new Command8("status").description("Show OpenClaw connection status").action(async () => {
  try {
    const cfg = loadConfig();
    if (!cfg.userId) {
      printError("Not logged in. Run 'botschat login' first.");
      process.exit(1);
    }
    const result = await connectionApi.status(cfg.userId);
    printResult({
      connected: result.connected ? "yes" : "no",
      agents: result.agents?.join(", ") || "(none)",
      model: result.model ?? "(not set)"
    });
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/chat.ts
import { Command as Command9 } from "commander";
import { createInterface } from "readline/promises";
import { randomUUID as randomUUID3 } from "crypto";

// src/lib/ws-client.ts
import WebSocket from "ws";
var BotsChatWSClient = class {
  constructor(opts) {
    this.opts = opts;
  }
  ws = null;
  reconnectTimer = null;
  backoffMs = 1e3;
  intentionalClose = false;
  _connected = false;
  get connected() {
    return this._connected;
  }
  connect() {
    this.intentionalClose = false;
    this.ws = new WebSocket(this.opts.url);
    this.ws.on("open", () => {
      const token = this.opts.getToken();
      if (!token) {
        this.ws?.close();
        return;
      }
      this.ws.send(JSON.stringify({ type: "auth", token }));
    });
    this.ws.on("message", async (data) => {
      try {
        const raw = typeof data === "string" ? data : data.toString("utf-8");
        const msg = JSON.parse(raw);
        if (msg.encrypted && E2eService.hasKey()) {
          try {
            if (msg.type === "agent.text" || msg.type === "agent.media") {
              const text = msg.text;
              const messageId = msg.messageId;
              if (text && messageId) {
                msg.text = await E2eService.decrypt(text, messageId);
                msg.encrypted = false;
              }
            } else if (msg.type === "job.update") {
              const summary = msg.summary;
              const jobId = msg.jobId;
              if (summary && jobId) {
                msg.summary = await E2eService.decrypt(summary, jobId);
                msg.encrypted = false;
              }
            }
          } catch {
            msg.decryptionError = true;
          }
        }
        if (msg.type === "agent.stream.chunk" && msg.encrypted && msg.chunkId && E2eService.hasKey()) {
          try {
            msg.text = await E2eService.decrypt(
              msg.text,
              msg.chunkId
            );
            msg.encrypted = false;
          } catch {
          }
        }
        if (msg.type === "agent.activity" && msg.encrypted && msg.activityId && E2eService.hasKey()) {
          try {
            msg.text = await E2eService.decrypt(
              msg.text,
              msg.activityId
            );
            msg.encrypted = false;
          } catch {
          }
        }
        if (msg.type === "task.scan.result" && Array.isArray(msg.tasks) && E2eService.hasKey()) {
          for (const t of msg.tasks) {
            if (t.encrypted && t.iv) {
              try {
                if (t.schedule)
                  t.schedule = await E2eService.decrypt(
                    t.schedule,
                    t.iv
                  );
                if (t.instructions)
                  t.instructions = await E2eService.decrypt(
                    t.instructions,
                    t.iv
                  );
                t.encrypted = false;
              } catch {
                t.decryptionError = true;
              }
            }
          }
        }
        if (msg.type === "auth.ok") {
          this.backoffMs = 1e3;
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
      }
    });
    this.ws.on("close", (code) => {
      this._connected = false;
      this.opts.onStatusChange(false);
      if (!this.intentionalClose && !this.opts.noReconnect) {
        const isAuthFail = code === 4001;
        this.reconnectTimer = setTimeout(async () => {
          this.backoffMs = Math.min(this.backoffMs * 2, 3e4);
          if (isAuthFail) {
            const ok = await tryRefreshAccessToken();
            if (ok) this.backoffMs = 1e3;
          }
          this.connect();
        }, this.backoffMs);
      }
    });
    this.ws.on("error", () => {
    });
  }
  async send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (msg.type === "user.message" && E2eService.hasKey() && typeof msg.text === "string") {
        try {
          const existingId = msg.messageId || void 0;
          const { ciphertext, messageId } = await E2eService.encrypt(
            msg.text,
            existingId
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
  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }
};

// src/commands/chat.ts
var chatCmd = new Command9("chat").description("Chat with an AI agent").argument("[message]", "Message to send (omit for interactive mode)").option("-i, --interactive", "Interactive REPL mode").option("-s, --session <sessionId>", "Session ID").option("-c, --channel <channelId>", "Channel ID").option("-a, --agent <agentId>", "Agent ID").option("--no-stream", "Wait for full response instead of streaming").option("--pipe", "Read message from stdin").option("--timeout <ms>", "Timeout in ms for single-shot mode", "120000").action(async (message, opts) => {
  try {
    const cfg = loadConfig();
    if (!cfg.userId || !cfg.token) {
      printError("Not logged in. Run 'botschat login' first.");
      process.exit(1);
    }
    if (opts.pipe) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      message = Buffer.concat(chunks).toString("utf-8").trim();
    }
    const interactive = opts.interactive || !message;
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
    const wsProtocol = cfg.url.startsWith("https") ? "wss" : "ws";
    const wsHost = cfg.url.replace(/^https?:\/\//, "");
    const wsUrl = `${wsProtocol}://${wsHost}/api/ws/${cfg.userId}/${encodeURIComponent(sessionId)}`;
    if (interactive) {
      await runInteractive(wsUrl, sessionId, opts.agent, cfg.userId);
    } else {
      await runSingleShot(
        wsUrl,
        sessionId,
        message,
        opts.agent,
        parseInt(opts.timeout),
        opts.stream !== false
      );
    }
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
async function runSingleShot(wsUrl, sessionKey, message, agentId, timeout = 12e4, stream = true) {
  return new Promise((resolve, reject) => {
    let fullText = "";
    let streaming = false;
    let timer;
    const ws = new BotsChatWSClient({
      url: wsUrl,
      getToken,
      noReconnect: true,
      onStatusChange: async (connected) => {
        if (connected) {
          const msg = {
            type: "user.message",
            sessionKey,
            text: message,
            messageId: randomUUID3()
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
            const text = msg.text;
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
            const text = msg.text;
            if (text) {
              printInfo(`[${msg.kind}] ${text}`);
            }
          }
        }
        if (msg.type === "agent.text") {
          clearTimeout(timer);
          if (!streaming) {
            const text = msg.text;
            if (isJsonMode()) {
              printJson(msg);
            } else {
              console.log(text);
            }
          }
          ws.disconnect();
          resolve();
        }
      }
    });
    ws.connect();
  });
}
async function runInteractive(wsUrl, sessionKey, agentId, userId) {
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
          const text = msg.text;
          if (text) process.stdout.write(text);
        } else if (msg.type === "agent.stream.end" && streaming) {
          streaming = false;
          process.stdout.write("\n\n");
        } else if (msg.type === "agent.activity") {
          const text = msg.text;
          if (text) printInfo(`[${msg.kind}] ${text}`);
        } else if (msg.type === "agent.text") {
          if (!streaming) {
            if (isJsonMode()) {
              printJson(msg);
            } else {
              console.log(`${msg.text}
`);
            }
          }
        }
      }
    });
    ws.connect();
    function startRepl() {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "> "
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
        const msg = {
          type: "user.message",
          sessionKey,
          text,
          messageId: randomUUID3()
        };
        if (agentId) msg.targetAgentId = agentId;
        await ws.send(msg);
        const waitForResponse = () => {
          const origOnMsg = ws["opts"].onMessage;
          ws["opts"].onMessage = (m) => {
            origOnMsg(m);
            if (m.type === "agent.text" || m.type === "agent.stream.end") {
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

// src/commands/tasks.ts
import { Command as Command10 } from "commander";
var tasksCmd = new Command10("tasks").description("Manage background tasks").action(async () => {
  try {
    const { tasks } = await tasksApi.listAll("background");
    printTable(
      tasks.map((t) => ({
        id: t.id,
        name: t.name,
        channel: t.channelId,
        enabled: t.enabled ? "yes" : "no",
        schedule: t.schedule ?? "(none)",
        cronJobId: t.openclawCronJobId ?? "(none)"
      })),
      [
        { key: "id", label: "ID", width: 20 },
        { key: "name", label: "Name", width: 20 },
        { key: "channel", label: "Channel", width: 20 },
        { key: "enabled", label: "Enabled", width: 8 },
        { key: "schedule", label: "Schedule", width: 15 }
      ]
    );
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tasksCmd.command("list <channelId>").description("List tasks for a channel").action(async (channelId) => {
  try {
    const { tasks } = await tasksApi.list(channelId);
    printTable(
      tasks.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        enabled: t.enabled ? "yes" : "no",
        schedule: t.schedule ?? "(none)"
      })),
      [
        { key: "id", label: "ID", width: 20 },
        { key: "name", label: "Name", width: 20 },
        { key: "kind", label: "Kind", width: 12 },
        { key: "enabled", label: "Enabled", width: 8 },
        { key: "schedule", label: "Schedule", width: 15 }
      ]
    );
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tasksCmd.command("create <channelId> <name>").description("Create a task").option("--kind <kind>", "Task kind", "background").option("--schedule <schedule>", "Cron schedule").option("--instructions <text>", "Task instructions").action(async (channelId, name, opts) => {
  try {
    const task = await tasksApi.create(channelId, {
      name,
      kind: opts.kind,
      schedule: opts.schedule,
      instructions: opts.instructions
    });
    if (isJsonMode()) {
      printJson(task);
    } else {
      console.log(`Task created: ${task.id} (${task.name})`);
    }
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tasksCmd.command("update <channelId> <taskId>").description("Update a task").option("--name <name>", "New name").option("--schedule <schedule>", "New schedule").option("--instructions <text>", "New instructions").option("--model <model>", "New model").option("--enabled <bool>", "Enable/disable").action(async (channelId, taskId, opts) => {
  try {
    const data = {};
    if (opts.name) data.name = opts.name;
    if (opts.schedule) data.schedule = opts.schedule;
    if (opts.instructions) data.instructions = opts.instructions;
    if (opts.model) data.model = opts.model;
    if (opts.enabled !== void 0)
      data.enabled = opts.enabled === "true";
    await tasksApi.update(channelId, taskId, data);
    console.log("Task updated.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tasksCmd.command("delete <channelId> <taskId>").description("Delete a task").option("-y, --yes", "Skip confirmation").action(async (channelId, taskId, opts) => {
  try {
    if (!opts.yes) {
      const { createInterface: createInterface2 } = await import("readline/promises");
      const rl = createInterface2({
        input: process.stdin,
        output: process.stderr
      });
      const answer = await rl.question(`Delete task ${taskId}? [y/N] `);
      rl.close();
      if (answer.toLowerCase() !== "y") {
        console.log("Cancelled.");
        return;
      }
    }
    await tasksApi.delete(channelId, taskId);
    console.log("Task deleted.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tasksCmd.command("run <channelId> <taskId>").description("Run a task immediately").action(async (channelId, taskId) => {
  try {
    const result = await tasksApi.run(channelId, taskId);
    console.log(result.message || "Task execution triggered.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});
tasksCmd.command("scan").description("Show live OpenClaw task data").action(async () => {
  try {
    const { tasks } = await tasksApi.scanData();
    if (isJsonMode()) {
      printJson(tasks);
    } else {
      printTable(
        tasks.map((t) => ({
          cronJobId: t.cronJobId,
          schedule: t.schedule,
          model: t.model || "(default)",
          enabled: t.enabled ? "yes" : "no",
          encrypted: t.encrypted ? "yes" : "no"
        })),
        [
          { key: "cronJobId", label: "Cron Job ID", width: 38 },
          { key: "schedule", label: "Schedule", width: 15 },
          { key: "model", label: "Model", width: 20 },
          { key: "enabled", label: "Enabled", width: 8 }
        ]
      );
    }
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/jobs.ts
import { Command as Command11 } from "commander";
var jobsCmd = new Command11("jobs").description("View job history").argument("<taskId>", "Task ID").option("--limit <n>", "Max results", "50").action(async (taskId) => {
  try {
    const { jobs } = await jobsApi.listByTask(taskId);
    for (const job of jobs) {
      if (job.encrypted && job.summary && E2eService.hasKey()) {
        try {
          job.summary = await E2eService.decrypt(job.summary, job.id);
          job.encrypted = false;
        } catch {
          job.summary = "[decryption failed]";
        }
      }
    }
    printTable(
      jobs.map((j) => ({
        id: j.id,
        number: j.number,
        status: j.status,
        started: new Date(j.startedAt).toLocaleString(),
        duration: j.durationMs ? `${(j.durationMs / 1e3).toFixed(1)}s` : "-",
        summary: j.summary || ""
      })),
      [
        { key: "number", label: "#", width: 5 },
        { key: "status", label: "Status", width: 10 },
        { key: "started", label: "Started", width: 20 },
        { key: "duration", label: "Duration", width: 10 },
        { key: "summary", label: "Summary", width: 40 }
      ]
    );
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/messages.ts
import { Command as Command12 } from "commander";
var messagesCmd = new Command12("messages").description("View message history").argument("<sessionKey>", "Session key").option("--limit <n>", "Max results", "50").option("--thread <threadId>", "Thread ID").action(async (sessionKey, opts) => {
  try {
    const cfg = loadConfig();
    if (!cfg.userId) {
      printError("Not logged in.");
      process.exit(1);
    }
    const { messages } = await messagesApi.list(
      cfg.userId,
      sessionKey,
      opts.thread
    );
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
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/config-cmd.ts
import { Command as Command13 } from "commander";
var configCmd = new Command13("config").description("View/edit CLI configuration").action(() => {
  const cfg = loadConfig();
  const masked = {
    url: cfg.url,
    userId: cfg.userId ?? "(not set)",
    token: cfg.token ? cfg.token.slice(0, 10) + "..." : "(not set)",
    refreshToken: cfg.refreshToken ? "***" : "(not set)",
    e2ePassword: cfg.e2ePassword ? "***" : "(not set)",
    defaultChannel: cfg.defaultChannel ?? "(not set)",
    defaultSession: cfg.defaultSession ?? "(not set)"
  };
  if (isJsonMode()) {
    printJson(masked);
  } else {
    printResult(masked);
  }
});
configCmd.command("set <key> <value>").description("Set a config value").action((key, value) => {
  const validKeys = [
    "url",
    "defaultChannel",
    "defaultSession"
  ];
  if (!validKeys.includes(key)) {
    printError(
      `Invalid key. Valid keys: ${validKeys.join(", ")}`
    );
    process.exit(1);
  }
  updateConfig({ [key]: value });
  console.log(`${key} = ${value}`);
});
configCmd.command("e2e").description("Manage E2E encryption password").option("--password <password>", "Set E2E password").option("--clear", "Remove E2E password").action(async (opts) => {
  try {
    const cfg = loadConfig();
    if (!cfg.userId) {
      printError("Not logged in. Run 'botschat login' first.");
      process.exit(1);
    }
    if (opts.clear) {
      E2eService.clear();
      console.log("E2E password cleared.");
      return;
    }
    let password = opts.password;
    if (!password) {
      const { createInterface: createInterface2 } = await import("readline/promises");
      const rl = createInterface2({
        input: process.stdin,
        output: process.stderr
      });
      password = await rl.question("E2E Password: ");
      rl.close();
    }
    if (!password) {
      printError("Password is required.");
      process.exit(1);
    }
    await E2eService.setPassword(password, cfg.userId, true);
    console.log("E2E password set and key derived.");
  } catch (err) {
    printError(String(err.message));
    process.exit(1);
  }
});

// src/commands/setup.ts
import { Command as Command14 } from "commander";
var setupCmd = new Command14("setup").description("One-shot onboarding (setup/init)").option("--secret <secret>", "Dev auth secret").option("--email <email>", "Email").option("--password <password>", "Password").option("--user <userId>", "User ID for dev auth").action(async (opts) => {
  try {
    const data = {};
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
          `Channel:       ${result.channels[0].name} (${result.channels[0].id})`
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
    printError(String(err.message));
    process.exit(1);
  }
});

// src/index.ts
var program = new Command15();
program.name("botschat").description("BotsChat CLI \u2014 headless client for BotsChat").version("0.1.0").option("--json", "Output JSON (machine-readable)").option("--url <url>", "Override server URL").option("--config <path>", "Config file path").hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.config) setConfigPath(opts.config);
  if (opts.json) setJsonMode(true);
  if (opts.url) updateConfig({ url: opts.url });
  initApiClient();
  if (opts.url) setApiBase(opts.url);
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
