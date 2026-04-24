import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { TapdConfig, TapdCredentials } from "./types.js";

const configSchema = z.object({
  companyId: z.string().optional(),
  defaultWorkspaceId: z.string().optional(),
  defaultWorkspaceName: z.string().optional(),
  defaultCreator: z.string().optional(),
  workspaces: z.array(z.object({
    id: z.string(),
    name: z.string(),
    companyId: z.string().optional()
  })).optional()
});

const credentialsSchema = z.object({
  mode: z.literal("app").optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1)
}).or(z.object({
  mode: z.literal("personal"),
  personalToken: z.string().min(1)
}));

export function tapdDir(cwd = process.cwd()): string {
  return path.join(cwd, ".tapd");
}

export function configPath(cwd = process.cwd()): string {
  return path.join(tapdDir(cwd), "config.json");
}

export function credentialsPath(cwd = process.cwd()): string {
  return path.join(tapdDir(cwd), "credentials.json");
}

async function readJson<T>(file: string, schema: z.ZodType<T>, fallback?: T): Promise<T> {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`配置文件不存在：${file}`);
  }
  const raw = await readFile(file, "utf8");
  return schema.parse(JSON.parse(raw));
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export async function loadConfig(cwd = process.cwd()): Promise<TapdConfig> {
  return readJson(configPath(cwd), configSchema, {});
}

export async function saveConfig(config: TapdConfig, cwd = process.cwd()): Promise<void> {
  await writeJson(configPath(cwd), config);
}

export async function loadCredentials(cwd = process.cwd()): Promise<TapdCredentials> {
  return readJson(credentialsPath(cwd), credentialsSchema);
}

export async function saveCredentials(credentials: TapdCredentials, cwd = process.cwd()): Promise<void> {
  await writeJson(credentialsPath(cwd), credentials);
}

export async function requireConfig(cwd = process.cwd()): Promise<TapdConfig> {
  const config = await loadConfig(cwd);
  if (!config.companyId) {
    throw new Error("缺少 company_id，请先运行 tapd auth bind");
  }
  return config;
}

export async function requireWorkspace(cwd = process.cwd(), override?: string): Promise<string> {
  if (override) return override;
  const config = await requireConfig(cwd);
  if (!config.defaultWorkspaceId) {
    throw new Error("缺少默认 workspace_id，请先运行 tapd init 或 tapd workspace use");
  }
  return config.defaultWorkspaceId;
}

export async function resolveWorkspaceContext(cwd = process.cwd(), override?: string): Promise<{
  id: string;
  name?: string;
}> {
  const config = await loadConfig(cwd);
  const id = override ?? config.defaultWorkspaceId;
  if (!id) {
    throw new Error("缺少默认 workspace_id，请先运行 tapd init 或 tapd workspace use");
  }
  const cached = config.workspaces?.find((item) => item.id === id);
  return {
    id,
    name: cached?.name ?? (id === config.defaultWorkspaceId ? config.defaultWorkspaceName : undefined)
  };
}

export function resolveWorkspaceContextSync(cwd = process.cwd(), override?: string): {
  id?: string;
  name?: string;
} {
  const file = configPath(cwd);
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, "utf8");
  const config = configSchema.parse(JSON.parse(raw));
  const id = override ?? config.defaultWorkspaceId;
  if (!id) return {};
  const cached = config.workspaces?.find((item) => item.id === id);
  return {
    id,
    name: cached?.name ?? (id === config.defaultWorkspaceId ? config.defaultWorkspaceName : undefined)
  };
}
