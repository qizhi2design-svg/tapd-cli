import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
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
export function homeTapdDir() {
    return path.join(os.homedir(), ".tapd");
}
export function tapdDir(cwd = process.cwd()) {
    return path.join(cwd, ".tapd");
}
export function globalConfigPath() {
    return path.join(homeTapdDir(), "config.json");
}
export function globalCredentialsPath() {
    return path.join(homeTapdDir(), "credentials.json");
}
export function configPath(cwd = process.cwd()) {
    return path.join(tapdDir(cwd), "config.json");
}
export function credentialsPath(cwd = process.cwd()) {
    return path.join(tapdDir(cwd), "credentials.json");
}
async function readJson(file, schema, fallback) {
    if (!existsSync(file)) {
        if (fallback !== undefined)
            return fallback;
        throw new Error(`配置文件不存在：${file}`);
    }
    const raw = await readFile(file, "utf8");
    return schema.parse(JSON.parse(raw));
}
async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
function mergeWorkspaces(base, override) {
    if (!base?.length)
        return override;
    if (!override?.length)
        return base;
    const map = new Map();
    for (const item of base)
        map.set(item.id, item);
    for (const item of override)
        map.set(item.id, item);
    return Array.from(map.values());
}
function mergeConfig(base, override) {
    return {
        ...base,
        ...override,
        workspaces: mergeWorkspaces(base.workspaces, override.workspaces)
    };
}
async function loadOptionalConfig(file) {
    return readJson(file, configSchema, {});
}
export async function loadGlobalConfig() {
    return loadOptionalConfig(globalConfigPath());
}
export async function loadProjectConfig(cwd = process.cwd()) {
    return loadOptionalConfig(configPath(cwd));
}
export async function loadConfig(cwd = process.cwd()) {
    const global = await loadGlobalConfig();
    const localFile = configPath(cwd);
    if (localFile === globalConfigPath() || !existsSync(localFile)) {
        return global;
    }
    const local = await loadProjectConfig(cwd);
    return mergeConfig(global, local);
}
export function loadConfigSync(cwd = process.cwd()) {
    const globalFile = globalConfigPath();
    const global = existsSync(globalFile)
        ? configSchema.parse(JSON.parse(readFileSync(globalFile, "utf8")))
        : {};
    const localFile = configPath(cwd);
    if (localFile === globalFile || !existsSync(localFile)) {
        return global;
    }
    const local = configSchema.parse(JSON.parse(readFileSync(localFile, "utf8")));
    return mergeConfig(global, local);
}
export async function saveConfig(config, cwd = process.cwd()) {
    await writeJson(configPath(cwd), config);
}
export async function saveProjectConfig(config, cwd = process.cwd()) {
    await writeJson(configPath(cwd), config);
}
export async function saveGlobalConfig(config) {
    await writeJson(globalConfigPath(), config);
}
export async function loadCredentials(_cwd = process.cwd()) {
    return readJson(globalCredentialsPath(), credentialsSchema);
}
export async function saveCredentials(credentials) {
    await writeJson(globalCredentialsPath(), credentials);
}
export async function saveGlobalCredentials(credentials) {
    await writeJson(globalCredentialsPath(), credentials);
}
export async function deleteCredentials() {
    const file = globalCredentialsPath();
    if (!existsSync(file))
        return;
    await import("node:fs/promises").then(({ rm }) => rm(file, { force: true }));
}
export async function requireConfig(cwd = process.cwd()) {
    const config = await loadConfig(cwd);
    if (!config.companyId) {
        throw new Error("缺少 company_id，请先运行 tapd login");
    }
    return config;
}
export async function requireWorkspace(cwd = process.cwd(), override) {
    if (override)
        return override;
    const config = await requireConfig(cwd);
    if (!config.defaultWorkspaceId) {
        throw new Error("缺少默认 workspace_id，请先运行 tapd init 或 tapd workspace use");
    }
    return config.defaultWorkspaceId;
}
export async function resolveWorkspaceContext(cwd = process.cwd(), override) {
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
export function resolveWorkspaceContextSync(cwd = process.cwd(), override) {
    const config = loadConfigSync(cwd);
    const id = override ?? config.defaultWorkspaceId;
    if (!id)
        return {};
    const cached = config.workspaces?.find((item) => item.id === id);
    return {
        id,
        name: cached?.name ?? (id === config.defaultWorkspaceId ? config.defaultWorkspaceName : undefined)
    };
}
//# sourceMappingURL=config.js.map