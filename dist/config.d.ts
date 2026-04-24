import type { TapdConfig, TapdCredentials } from "./types.js";
export declare function homeTapdDir(): string;
export declare function tapdDir(cwd?: string): string;
export declare function globalConfigPath(): string;
export declare function globalCredentialsPath(): string;
export declare function configPath(cwd?: string): string;
export declare function credentialsPath(cwd?: string): string;
export declare function loadGlobalConfig(): Promise<TapdConfig>;
export declare function loadProjectConfig(cwd?: string): Promise<TapdConfig>;
export declare function loadConfig(cwd?: string): Promise<TapdConfig>;
export declare function loadConfigSync(cwd?: string): TapdConfig;
export declare function saveConfig(config: TapdConfig, cwd?: string): Promise<void>;
export declare function saveProjectConfig(config: TapdConfig, cwd?: string): Promise<void>;
export declare function saveGlobalConfig(config: TapdConfig): Promise<void>;
export declare function loadCredentials(_cwd?: string): Promise<TapdCredentials>;
export declare function saveCredentials(credentials: TapdCredentials): Promise<void>;
export declare function saveGlobalCredentials(credentials: TapdCredentials): Promise<void>;
export declare function deleteCredentials(): Promise<void>;
export declare function requireConfig(cwd?: string): Promise<TapdConfig>;
export declare function requireWorkspace(cwd?: string, override?: string): Promise<string>;
export declare function resolveWorkspaceContext(cwd?: string, override?: string): Promise<{
    id: string;
    name?: string;
}>;
export declare function resolveWorkspaceContextSync(cwd?: string, override?: string): {
    id?: string;
    name?: string;
};
