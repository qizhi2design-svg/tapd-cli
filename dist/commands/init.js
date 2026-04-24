import { select } from "@inquirer/prompts";
import ora from "ora";
import { TapdClient } from "../api.js";
import { loadConfig, loadCredentials, saveConfig } from "../config.js";
import { getToken } from "../session.js";
import { currentWorkspaceHelpText, exitHint, success, withSpinner } from "../ui.js";
export function registerInit(program) {
    program
        .command("init")
        .description("初始化当前项目，选择默认 TAPD 空间")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .addHelpText("after", `
示例：
  tapd init

说明：
  应用凭证模式会读取 company_id 并拉取空间列表供下拉选择。
  个人令牌模式会验证当前默认 workspace，因为个人令牌通常不能列出企业项目。
`)
        .action(async () => {
        const config = await loadConfig();
        const credentials = await loadCredentials().catch(() => {
            throw new Error("缺少 TAPD 凭证，请先运行 tapd auth bind");
        });
        const client = new TapdClient();
        const token = await getToken(client);
        if (credentials.mode === "personal") {
            if (!config.defaultWorkspaceId) {
                throw new Error("个人令牌模式缺少默认 workspace_id，请重新运行 tapd auth bind --mode personal --workspace-id <id>");
            }
            const defaultWorkspaceId = config.defaultWorkspaceId;
            const spinner = ora("验证默认 TAPD 空间").start();
            const workspace = await withSpinner(spinner, () => client.verifyPersonalToken(token, defaultWorkspaceId), {
                successText: `默认空间可用：${config.defaultWorkspaceName ?? config.defaultWorkspaceId}`
            });
            // 选择默认创建人
            const users = await client.listUsers(token, workspace.id);
            let defaultCreator;
            if (users.length > 0) {
                exitHint();
                defaultCreator = await select({
                    message: "选择默认创建人",
                    choices: [
                        { name: "不设置默认创建人", value: "" },
                        ...users.map((item) => ({
                            name: `${item.user}${item.name ? ` - ${item.name}` : ""}`,
                            value: item.user
                        }))
                    ]
                });
                if (defaultCreator === "")
                    defaultCreator = undefined;
            }
            await saveConfig({
                ...config,
                companyId: workspace.companyId ?? config.companyId,
                defaultWorkspaceId: workspace.id,
                defaultWorkspaceName: workspace.name,
                defaultCreator,
                workspaces: upsertWorkspace(config.workspaces, workspace)
            });
            success("初始化完成");
            if (defaultCreator) {
                success(`默认创建人：${defaultCreator}`);
            }
            return;
        }
        if (!config.companyId)
            throw new Error("缺少 company_id，请先运行 tapd auth bind");
        const spinner = ora("拉取 TAPD 空间列表").start();
        const companyId = config.companyId;
        const workspaces = await withSpinner(spinner, () => client.listWorkspaces(token, companyId), {
            stopOnSuccess: true
        });
        if (workspaces.length === 0)
            throw new Error("当前 company_id 下没有可用空间");
        exitHint();
        const workspaceId = await select({
            message: "选择默认空间",
            choices: workspaces.map((workspace) => ({
                name: `${workspace.name} (${workspace.id})`,
                value: workspace.id
            }))
        });
        const workspace = workspaces.find((item) => item.id === workspaceId);
        // 选择默认创建人
        const users = await client.listUsers(token, workspaceId);
        let defaultCreator;
        if (users.length > 0) {
            defaultCreator = await select({
                message: "选择默认创建人",
                choices: [
                    { name: "不设置默认创建人", value: "" },
                    ...users.map((item) => ({
                        name: `${item.user}${item.name ? ` - ${item.name}` : ""}`,
                        value: item.user
                    }))
                ]
            });
            if (defaultCreator === "")
                defaultCreator = undefined;
        }
        await saveConfig({
            ...config,
            defaultWorkspaceId: workspace.id,
            defaultWorkspaceName: workspace.name,
            defaultCreator
        });
        success(`默认空间：${workspace.name} (${workspace.id})`);
        if (defaultCreator) {
            success(`默认创建人：${defaultCreator}`);
        }
    });
}
function upsertWorkspace(current, workspace) {
    const next = (current ?? []).filter((item) => item.id !== workspace.id);
    next.push(workspace);
    return next;
}
//# sourceMappingURL=init.js.map