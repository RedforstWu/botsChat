/**
 * REST API client — adapted from packages/web/src/api.ts.
 * Uses Node.js native fetch and file-based config instead of localStorage.
 */
import { loadConfig, updateConfig } from "./config.js";

let _token: string | null = null;
let _refreshToken: string | null = null;
let _apiBase: string = "";

/** Initialize from config file. Call on startup. */
export function initApiClient(): void {
  const cfg = loadConfig();
  _token = cfg.token;
  _refreshToken = cfg.refreshToken;
  _apiBase = `${cfg.url}/api`;
}

export function setToken(token: string | null): void {
  _token = token;
  updateConfig({ token });
}

export function setRefreshToken(token: string | null): void {
  _refreshToken = token;
  updateConfig({ refreshToken: token });
}

export function getToken(): string | null {
  return _token;
}

export function getRefreshToken(): string | null {
  return _refreshToken;
}

export function getApiBase(): string {
  return _apiBase;
}

/** Override base URL (for --url flag). */
export function setApiBase(url: string): void {
  _apiBase = `${url.replace(/\/+$/, "")}/api`;
}

export async function tryRefreshAccessToken(): Promise<boolean> {
  if (!_refreshToken) return false;
  try {
    const res = await fetch(`${_apiBase}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token: string };
    _token = data.token;
    updateConfig({ token: data.token });
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  let res: Response;
  try {
    res = await fetch(`${_apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`Network error: ${err}`);
  }

  // Auto-refresh on 401
  if (res.status === 401 && _refreshToken && !path.includes("/auth/refresh")) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${_token}`;
      try {
        res = await fetch(`${_apiBase}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        throw new Error(`Network error on retry: ${err}`);
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message = (err as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }

  return (await res.json()) as T;
}

// ---- Types ----
export type AuthResponse = {
  id: string;
  email: string;
  token: string;
  refreshToken?: string;
  displayName?: string;
};
export type UserSettings = { defaultModel?: string; notifyPreview?: boolean };
export type ModelInfo = { id: string; name: string; provider: string };
export type Agent = {
  id: string;
  name: string;
  sessionKey: string;
  isDefault: boolean;
  channelId: string | null;
};
export type Channel = {
  id: string;
  name: string;
  description: string;
  openclawAgentId: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
};
export type Session = {
  id: string;
  name: string;
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
};
export type Task = {
  id: string;
  name: string;
  kind: "background" | "adhoc";
  openclawCronJobId: string | null;
  schedule: string | null;
  instructions: string | null;
  model: string | null;
  sessionKey: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};
export type TaskWithChannel = Task & { channelId: string };
export type TaskScanEntry = {
  cronJobId: string;
  schedule: string;
  instructions: string;
  model: string;
  enabled: boolean;
  encrypted?: boolean;
  iv?: string;
};
export type Job = {
  id: string;
  number: number;
  sessionKey: string;
  status: "running" | "ok" | "error" | "skipped";
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  summary: string;
  time: string;
  encrypted?: boolean;
};
export type MessageRecord = {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: number;
  mediaUrl?: string;
  a2ui?: string;
  threadId?: string;
  encrypted?: boolean | number;
  mediaEncrypted?: boolean;
};
export type PairingToken = {
  id: string;
  tokenPreview: string;
  label: string | null;
  lastConnectedAt: number | null;
  createdAt: number;
};

// ---- API namespaces ----

export const authApi = {
  register: (email: string, password: string, displayName?: string) =>
    request<AuthResponse>("POST", "/auth/register", {
      email,
      password,
      displayName,
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("POST", "/auth/login", { email, password }),
  me: () =>
    request<{
      id: string;
      email: string;
      displayName: string | null;
      settings: UserSettings;
    }>("GET", "/me"),
};

export const devAuthApi = {
  login: (secret: string, userId?: string) =>
    request<{ token: string; userId: string }>("POST", "/dev-auth/login", {
      secret,
      userId: userId ?? "dev-test-user",
    }),
};

export const meApi = {
  updateSettings: (data: {
    defaultModel?: string;
    notifyPreview?: boolean;
  }) => request<{ ok: boolean; settings: UserSettings }>("PATCH", "/me", data),
};

export const modelsApi = {
  list: () => request<{ models: ModelInfo[] }>("GET", "/models"),
};

export const agentsApi = {
  list: () => request<{ agents: Agent[] }>("GET", "/agents"),
};

export const channelsApi = {
  list: () => request<{ channels: Channel[] }>("GET", "/channels"),
  get: (id: string) => request<Channel>("GET", `/channels/${id}`),
  create: (data: {
    name: string;
    description?: string;
    systemPrompt?: string;
    openclawAgentId?: string;
  }) => request<Channel>("POST", "/channels", data),
  update: (
    id: string,
    data: Partial<Pick<Channel, "name" | "description" | "systemPrompt">>,
  ) => request<{ ok: boolean }>("PATCH", `/channels/${id}`, data),
  delete: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/channels/${id}`),
};

export const sessionsApi = {
  list: (channelId: string) =>
    request<{ sessions: Session[] }>(
      "GET",
      `/channels/${channelId}/sessions`,
    ),
  create: (channelId: string, name?: string) =>
    request<Session>("POST", `/channels/${channelId}/sessions`, { name }),
  rename: (channelId: string, sessionId: string, name: string) =>
    request<{ ok: boolean }>(
      "PATCH",
      `/channels/${channelId}/sessions/${sessionId}`,
      { name },
    ),
  delete: (channelId: string, sessionId: string) =>
    request<{ ok: boolean }>(
      "DELETE",
      `/channels/${channelId}/sessions/${sessionId}`,
    ),
};

export const tasksApi = {
  list: (channelId: string) =>
    request<{ tasks: Task[] }>("GET", `/channels/${channelId}/tasks`),
  listAll: (kind: "background" | "adhoc" = "background") =>
    request<{ tasks: TaskWithChannel[] }>("GET", `/tasks?kind=${kind}`),
  scanData: () => request<{ tasks: TaskScanEntry[] }>("GET", "/task-scan"),
  create: (
    channelId: string,
    data: {
      name: string;
      kind: "background" | "adhoc";
      schedule?: string;
      instructions?: string;
    },
  ) => request<Task>("POST", `/channels/${channelId}/tasks`, data),
  update: (
    channelId: string,
    taskId: string,
    data: Partial<
      Pick<Task, "name" | "schedule" | "instructions" | "model" | "enabled">
    >,
  ) =>
    request<{ ok: boolean }>(
      "PATCH",
      `/channels/${channelId}/tasks/${taskId}`,
      data,
    ),
  delete: (channelId: string, taskId: string) =>
    request<{ ok: boolean }>(
      "DELETE",
      `/channels/${channelId}/tasks/${taskId}`,
    ),
  run: (channelId: string, taskId: string) =>
    request<{ ok: boolean; message: string }>(
      "POST",
      `/channels/${channelId}/tasks/${taskId}/run`,
    ),
};

export const jobsApi = {
  list: (channelId: string, taskId: string) =>
    request<{ jobs: Job[] }>(
      "GET",
      `/channels/${channelId}/tasks/${taskId}/jobs`,
    ),
  listByTask: (taskId: string) =>
    request<{ jobs: Job[] }>("GET", `/tasks/${taskId}/jobs`),
};

export const messagesApi = {
  list: (userId: string, sessionKey: string, threadId?: string) =>
    request<{
      messages: MessageRecord[];
      replyCounts?: Record<string, number>;
    }>(
      "GET",
      `/messages/${userId}?sessionKey=${encodeURIComponent(sessionKey)}${threadId ? `&threadId=${encodeURIComponent(threadId)}` : ""}`,
    ),
};

export const pairingApi = {
  list: () => request<{ tokens: PairingToken[] }>("GET", "/pairing-tokens"),
  create: (label?: string) =>
    request<{ id: string; token: string; label: string | null }>(
      "POST",
      "/pairing-tokens",
      { label },
    ),
  delete: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/pairing-tokens/${id}`),
};

export const setupApi = {
  init: (data: { secret?: string; email?: string; password?: string; userId?: string }) =>
    request<{
      userId: string;
      token: string;
      refreshToken?: string;
      pairingToken: string;
      cloudUrl: string;
      channels: Channel[];
      setupCommands: string[];
    }>("POST", "/setup/init", data),
  cloudUrl: () =>
    request<{ cloudUrl: string; isLoopback: boolean; hint?: string }>(
      "GET",
      "/setup/cloud-url",
    ),
};

export const connectionApi = {
  status: (userId: string) =>
    request<{ connected: boolean; agents?: string[]; model?: string }>(
      "GET",
      `/connection/${userId}/status`,
    ),
};
