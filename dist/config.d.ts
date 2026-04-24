import type { TapdConfig, TapdCredentials } from "./types.js";
export declare function tapdDir(cwd?: string): string;
export declare function configPath(cwd?: string): string;
export declare function credentialsPath(cwd?: string): string;
export declare function loadConfig(cwd?: string): Promise<TapdConfig>;
export declare function saveConfig(config: TapdConfig, cwd?: string): Promise<void>;
export declare function loadCredentials(cwd?: string): Promise<TapdCredentials>;
export declare function saveCredentials(credentials: TapdCredentials, cwd?: string): Promise<void>;
export declare function requireConfig(cwd?: string): Promise<TapdConfig>;
export declare function requireWorkspace(cwd?: string, override?: string): Promise<string>;
export declare function resolveWorkspaceContext(cwd?: string, override?: string): Promise<{
    id: string;
    name?: string;
}>;
