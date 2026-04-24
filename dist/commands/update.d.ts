import { Command } from "commander";
type UpdateOptions = {
    packageName: string;
    currentVersion: string;
};
export declare function registerUpdate(program: Command, options: UpdateOptions): void;
export {};
