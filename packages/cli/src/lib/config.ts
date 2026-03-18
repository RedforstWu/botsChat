/**
 * Config file management — persists CLI state to ~/.botschat/config.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type CliConfig = {
  url: string;
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  e2ePassword: string | null;
  e2eKeyBase64: string | null;
  defaultChannel: string | null;
  defaultSession: string | null;
};

const CONFIG_DIR = join(homedir(), ".botschat");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: CliConfig = {
  url: "https://console.botschat.app",
  token: null,
  refreshToken: null,
  userId: null,
  e2ePassword: null,
  e2eKeyBase64: null,
  defaultChannel: null,
  defaultSession: null,
};

let _configPath = CONFIG_FILE;

/** Override config path (for --config flag). */
export function setConfigPath(path: string): void {
  _configPath = path;
}

export function getConfigPath(): string {
  return _configPath;
}

export function loadConfig(): CliConfig {
  try {
    if (existsSync(_configPath)) {
      const raw = readFileSync(_configPath, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // corrupt config — start fresh
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: CliConfig): void {
  const dir =
    _configPath === CONFIG_FILE
      ? CONFIG_DIR
      : join(_configPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(_configPath, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function getConfig(): CliConfig {
  return loadConfig();
}

export function updateConfig(partial: Partial<CliConfig>): CliConfig {
  const config = loadConfig();
  Object.assign(config, partial);
  saveConfig(config);
  return config;
}
