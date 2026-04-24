import { select } from "@inquirer/prompts";
import ora from "ora";
import { TapdClient } from "../api.js";
import { loadConfig, loadCredentials, requireConfig, resolveWorkspaceContext, saveConfig } from "../config.js";
import { getToken } from "../session.js";
import { currentWorkspaceHelpText, exitHint, info, success, table, withSpinner, workspaceBanner } from "../ui.js";
async function fetchWorkspaces() {
    const config = await requireConfig();
    const credentials = await loadCredentials();
    const token = await getToken();
    if (credentials.mode === "personal") {
        if (!config.defaultWorkspaceId) {
            throw new Error("个人令牌模式缺少默认 workspace_id，请运行 tapd auth bind --mode personal --workspace-id <id>");
        }
        const workspace = await new TapdClient().verifyPersonalToken(token, config.defaultWorkspaceId);
        const cached = upsertWorkspace(config.workspaces, workspace);
        return { config: { ...config, workspaces: cached }, credentials, workspaces: cached };
    }
    const workspaces = await new TapdClient().listWorkspaces(token, config.companyId);
    return { config, credentials, workspaces };
}
export function registerWorkspace(program) {
    const workspace = program
        .command("workspace")
        .description("TAPD 空间管理")
        .addHelpCommand(false)
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .addHelpText("after", `
示例：
  tapd workspace list
  tapd workspace add --workspace-id 58491787
  tapd workspace use
  tapd workspace use --workspace-id 58491787
`);
    workspace
        .command("list")
        .description("列出空间；个人令牌模式仅显示当前默认空间")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .action(async () => {
        const currentWorkspace = await resolveWorkspaceContext();
        workspaceBanner(currentWorkspace);
        const spinner = ora("拉取空间列表").start();
        const { config, credentials, workspaces } = await withSpinner(spinner, () => fetchWorkspaces(), {
            stopOnSuccess: true
        });
        if (credentials.mode === "personal") {
            info("个人令牌模式通常不能列出企业项目，仅验证并显示当前默认空间。");
        }
        table(workspaces.map((item) => ({
            id: item.id,
            name: item.name,
            company: item.companyId,
            current: item.id === config.defaultWorkspaceId ? "yes" : ""
        })));
    });
    workspace
        .command("add")
        .description("验证并缓存一个 workspace_id，适合个人令牌模式管理多个空间")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .requiredOption("-w, --workspace-id <id>", "要添加的 workspace_id")
        .action(async (options) => {
        const config = await loadConfig();
        const token = await getToken();
        const spinner = ora("验证 TAPD 空间").start();
        const workspace = await withSpinner(spinner, () => new TapdClient().verifyPersonalToken(token, options.workspaceId), {
            successText: "空间可用",
            failText: "验证 TAPD 空间失败"
        });
        await saveConfig({
            ...config,
            companyId: config.companyId ?? workspace.companyId,
            workspaces: upsertWorkspace(config.workspaces, workspace)
        });
        success(`已缓存空间：${workspace.name} (${workspace.id})`);
    });
    workspace
        .command("use")
        .description("选择默认空间；个人令牌模式可传 --workspace-id 验证切换")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .option("-w, --workspace-id <id>", "个人令牌模式下要切换到的 workspace_id")
        .action(async (options) => {
        const credentials = await loadCredentials();
        if (credentials.mode === "personal") {
            const config = await loadConfig();
            exitHint();
            const workspaceId = options.workspaceId ?? await select({
                message: "选择默认空间",
                choices: (config.workspaces && config.workspaces.length > 0
                    ? config.workspaces
                    : config.defaultWorkspaceId && config.defaultWorkspaceName
                        ? [{ id: config.defaultWorkspaceId, name: config.defaultWorkspaceName, companyId: config.companyId }]
                        : []).map((item) => ({
                    name: `${item.name} (${item.id})${item.id === config.defaultWorkspaceId ? " 当前" : ""}`,
                    value: item.id
                }))
            });
            if (!workspaceId)
                throw new Error("请提供 --workspace-id");
            const token = await getToken();
            const spinner = ora("验证 TAPD 空间").start();
            const workspace = await withSpinner(spinner, () => new TapdClient().verifyPersonalToken(token, workspaceId), {
                successText: "空间可用",
                failText: "验证 TAPD 空间失败"
            });
            await saveConfig({
                ...config,
                companyId: workspace.companyId ?? config.companyId,
                defaultWorkspaceId: workspace.id,
                defaultWorkspaceName: workspace.name,
                workspaces: upsertWorkspace(config.workspaces, workspace)
            });
            success(`默认空间：${workspace.name} (${workspace.id})`);
            return;
        }
        const spinner = ora("拉取空间列表").start();
        const { config, workspaces } = await withSpinner(spinner, () => fetchWorkspaces(), {
            stopOnSuccess: true
        });
        exitHint();
        const workspaceId = await select({
            message: "选择默认空间",
            choices: workspaces.map((item) => ({
                name: `${item.name} (${item.id})${item.id === config.defaultWorkspaceId ? " 当前" : ""}`,
                value: item.id
            }))
        });
        const current = workspaces.find((item) => item.id === workspaceId);
        await saveConfig({ ...await loadConfig(), defaultWorkspaceId: current.id, defaultWorkspaceName: current.name });
        success(`默认空间：${current.name} (${current.id})`);
    });
}
function upsertWorkspace(current, workspace) {
    const next = (current ?? []).filter((item) => item.id !== workspace.id);
    next.push(workspace);
    return next.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}
//# sourceMappingURL=workspace.js.map