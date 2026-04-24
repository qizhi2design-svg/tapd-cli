import type { TapdClient } from "./api.js";
import type { Task } from "./types.js";
export declare function parseTaskEffort(value?: string): number;
export declare function formatTaskSchedule(task: Task): string;
export declare function formatTaskEffort(value?: string): string;
export declare function formatTaskSummary(tasks: Task[]): string;
export declare function renderTaskList(tasks: Task[]): void;
export declare function loadTasks(client: TapdClient, token: string, params: {
    workspaceId: string;
    storyId?: string;
    iterationId?: string;
    status?: string;
    owner?: string;
    limit: number;
    all?: boolean;
}): Promise<{
    total: number;
    tasks: Task[];
}>;
