import { taskStatusLabel } from "./status.js";
import { compactList, info, truncate } from "./ui.js";
export function parseTaskEffort(value) {
    if (!value || value === "-")
        return 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
export function formatTaskSchedule(task) {
    if (task.begin && task.due)
        return `${task.begin} ~ ${task.due}`;
    return task.begin || task.due || "未排期";
}
export function formatTaskEffort(value) {
    return value && value !== "-" ? `${value}d` : "-";
}
export function formatTaskSummary(tasks) {
    const counts = {
        open: 0,
        progressing: 0,
        done: 0
    };
    let totalEffort = 0;
    let earliestBegin;
    let latestDue;
    const owners = new Set();
    for (const task of tasks) {
        if (task.status === "open")
            counts.open += 1;
        else if (task.status === "progressing")
            counts.progressing += 1;
        else if (task.status === "done")
            counts.done += 1;
        totalEffort += parseTaskEffort(task.effort);
        if (task.begin && (!earliestBegin || task.begin < earliestBegin))
            earliestBegin = task.begin;
        if (task.due && (!latestDue || task.due > latestDue))
            latestDue = task.due;
        for (const owner of (task.owner ?? "").split(";")) {
            const name = owner.trim();
            if (name)
                owners.add(name);
        }
    }
    const schedule = earliestBegin && latestDue
        ? `  起止时间：${earliestBegin} ~ ${latestDue}`
        : earliestBegin
            ? `  起始时间：${earliestBegin}`
            : latestDue
                ? `  截止时间：${latestDue}`
                : "";
    const ownerSummary = owners.size > 0 ? `  研发人员：${Array.from(owners).join("、")}` : "";
    return `未开始：${counts.open}  进行中：${counts.progressing}  已完成：${counts.done}  总预估工时：${totalEffort}${schedule}${ownerSummary}`;
}
export function renderTaskList(tasks) {
    const groups = [
        { status: "progressing", title: "进行中" },
        { status: "open", title: "未开始" },
        { status: "done", title: "已完成" }
    ];
    let printed = false;
    for (const group of groups) {
        const items = tasks.filter((task) => task.status === group.status);
        if (items.length === 0)
            continue;
        if (printed)
            console.log("");
        info(`${group.title}:`);
        compactList(items.map((task) => {
            const owner = task.owner || "未分配";
            const effort = formatTaskEffort(task.effort);
            const progress = task.progress ? `${task.progress}%` : "-";
            return {
                title: `${truncate(task.name, 72)} (${task.id})`,
                lines: [`${owner}  ${effort}  ${progress}  ${formatTaskSchedule(task)}`]
            };
        }));
        printed = true;
    }
    const others = tasks.filter((task) => !groups.some((group) => group.status === task.status));
    if (others.length > 0) {
        if (printed)
            console.log("");
        info("其他:");
        compactList(others.map((task) => {
            const owner = task.owner || "未分配";
            const effort = formatTaskEffort(task.effort);
            const progress = task.progress ? `${task.progress}%` : "-";
            return {
                title: `${truncate(task.name, 72)} (${task.id})`,
                lines: [`${taskStatusLabel(task.status)}  ${owner}  ${effort}  ${progress}  ${formatTaskSchedule(task)}`]
            };
        }));
    }
}
export async function loadTasks(client, token, params) {
    const total = await client.countTasks(token, {
        workspaceId: params.workspaceId,
        storyId: params.storyId,
        iterationId: params.iterationId,
        status: params.status,
        owner: params.owner
    });
    const target = params.all ? total : Math.min(total, params.limit);
    if (target === 0)
        return { total, tasks: [] };
    const tasks = [];
    let page = 1;
    while (tasks.length < target) {
        const batchSize = Math.min(200, target - tasks.length);
        const pageItems = await client.listTasks(token, {
            workspaceId: params.workspaceId,
            storyId: params.storyId,
            iterationId: params.iterationId,
            status: params.status,
            owner: params.owner,
            page,
            limit: batchSize
        });
        tasks.push(...pageItems);
        if (pageItems.length < batchSize)
            break;
        page += 1;
    }
    return { total, tasks };
}
//# sourceMappingURL=task-view.js.map