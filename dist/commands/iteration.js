import ora from "ora";
import { TapdClient } from "../api.js";
import { resolveWorkspaceContext } from "../config.js";
import { getToken } from "../session.js";
import { iterationStatusLabel, storyStatusLabel } from "../status.js";
import { formatTaskSummary, loadTasks, renderTaskList } from "../task-view.js";
import { compactList, info, success, truncate, withSpinner, workspaceBanner } from "../ui.js";
function formatStoryStatusSummary(stories, statusMap) {
    const counts = new Map();
    for (const story of stories) {
        const key = storyStatusLabel(story.status, statusMap);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
        .map(([status, count]) => `${status}：${count}`)
        .join("  ");
}
export function registerIteration(program) {
    const iteration = program
        .command("iteration")
        .description("TAPD 迭代管理")
        .addHelpCommand(false)
        .addHelpText("after", `
示例：
  tapd iteration list
  tapd iteration get 1151611517001007745
  tapd iteration tasks 1151611517001007745
`);
    iteration
        .command("list")
        .description("查看当前空间的迭代列表")
        .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
        .option("-s, --status <status>", "按迭代状态筛选")
        .action(async (options) => {
        const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const spinner = ora("查询迭代列表").start();
        const iterations = await withSpinner(spinner, async () => {
            const items = await client.listIterations(token, workspaceId);
            return options.status ? items.filter((item) => item.status === options.status) : items;
        }, { successText: "查询完成", failText: "查询迭代列表失败" });
        success(`共 ${iterations.length} 条`);
        compactList(iterations.map((item) => ({
            title: `${truncate(item.name, 48)} (${item.id})`,
            lines: [`状态：${iterationStatusLabel(item.status)}  时间：${item.startdate || "-"} ~ ${item.enddate || "-"}`]
        })));
    });
    iteration
        .command("get")
        .argument("<iteration-id>", "TAPD 迭代 ID")
        .description("查看迭代下的需求和汇总情况")
        .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
        .action(async (iterationId, options) => {
        const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const spinner = ora("查询迭代信息").start();
        const [iterationData, stories, storyStatusMap] = await withSpinner(spinner, async () => Promise.all([
            client.getIteration(token, workspaceId, iterationId),
            client.listStories(token, {
                workspaceId,
                iterationId,
                limit: 200
            }),
            client.getStoryStatusMap(token, workspaceId)
        ]), { successText: "查询完成", failText: "查询迭代信息失败" });
        info(`${iterationData.name} (${iterationData.id})`);
        info(`状态：${iterationStatusLabel(iterationData.status)}  时间：${iterationData.startdate || "-"} ~ ${iterationData.enddate || "-"}  创建人：${iterationData.creator || "-"}`);
        if (iterationData.description) {
            info(truncate(iterationData.description, 300));
        }
        success(`需求总数 ${stories.length}`);
        if (stories.length === 0) {
            info("暂无需求");
            return;
        }
        info(formatStoryStatusSummary(stories, storyStatusMap));
        compactList(stories.map((story) => ({
            title: `${truncate(story.name, 72)} (${story.id})`,
            lines: [`状态：${storyStatusLabel(story.status, storyStatusMap)}`]
        })));
    });
    iteration
        .command("tasks")
        .argument("<iteration-id>", "TAPD 迭代 ID")
        .description("查看迭代下的任务情况")
        .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
        .option("-s, --status <status>", "按任务状态筛选：open/progressing/done")
        .option("-o, --owner <owner>", "按处理人筛选")
        .option("--all", "拉取全部任务")
        .option("--limit <number>", "返回数量，默认 50", "50")
        .addHelpText("after", `
示例：
  tapd iteration tasks 1151611517001007745
  tapd iteration tasks 1151611517001007745 --status progressing
  tapd iteration tasks 1151611517001007745 --all
`)
        .action(async (iterationId, options) => {
        const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const limit = Number.parseInt(options.limit ?? "50", 10);
        if (!Number.isFinite(limit) || limit <= 0)
            throw new Error("--limit 必须是正整数");
        const spinner = ora("查询迭代任务").start();
        const [iterationData, taskResult] = await withSpinner(spinner, async () => Promise.all([
            client.getIteration(token, workspaceId, iterationId),
            loadTasks(client, token, {
                workspaceId,
                iterationId,
                status: options.status,
                owner: options.owner,
                limit,
                all: options.all
            })
        ]), { successText: "查询完成", failText: "查询迭代任务失败" });
        info(`${iterationData.name} (${iterationData.id})`);
        info(`状态：${iterationStatusLabel(iterationData.status)}  时间：${iterationData.startdate || "-"} ~ ${iterationData.enddate || "-"}`);
        success(`任务总数 ${taskResult.total}，当前展示 ${taskResult.tasks.length}`);
        if (taskResult.tasks.length === 0) {
            info("暂无任务");
            return;
        }
        info(formatTaskSummary(taskResult.tasks));
        renderTaskList(taskResult.tasks);
        if (!options.all && taskResult.total > taskResult.tasks.length) {
            info(`还有 ${taskResult.total - taskResult.tasks.length} 条未展示，可使用 --all 或调大 --limit`);
        }
    });
}
//# sourceMappingURL=iteration.js.map