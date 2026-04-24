import type { Ora } from "ora";
export declare function brand(): string;
export declare function success(message: string): void;
export declare function warn(message: string): void;
export declare function info(message: string): void;
export declare function workspaceBanner(workspace: {
    id: string;
    name?: string;
}): void;
export declare function fail(message: string): void;
export declare function maskSecret(value: string): string;
export declare function table(rows: Array<Record<string, string | undefined>>): void;
export declare function truncate(value: string | undefined, max?: number): string;
export declare function exitHint(): void;
export declare function withSpinner<T>(spinner: Ora, task: () => Promise<T>, options?: {
    successText?: string;
    failText?: string;
    stopOnSuccess?: boolean;
}): Promise<T>;
export declare function currentWorkspaceHelpText(cwd?: string): string;
