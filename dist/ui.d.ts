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
