import { select } from "@inquirer/prompts";
import ora from "ora";
import { TapdClient } from "../api.js";
import { loadConfig, loadCredentials, saveConfig } from "../config.js";
import { getToken } from "../session.js";
import { success } from "../ui.js";

export function registerInit(program: import("commander").Command): void {
  program
    .command("init")
    .description("初始化当前项目，选择默认 TAPD 空间")
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
        const spinner = ora("验证默认 TAPD 空间").start();
        const workspace = await client.verifyPersonalToken(token, config.defaultWorkspaceId);
        spinner.succeed(`默认空间可用：${workspace.name} (${workspace.id})`);
        await saveConfig({
          ...config,
          companyId: workspace.companyId ?? config.companyId,
          defaultWorkspaceId: workspace.id,
          defaultWorkspaceName: workspace.name,
          workspaces: upsertWorkspace(config.workspaces, workspace)
        });
        success("初始化完成");
        return;
      }

      if (!config.companyId) throw new Error("缺少 company_id，请先运行 tapd auth bind");

      const spinner = ora("拉取 TAPD 空间列表").start();
      const workspaces = await client.listWorkspaces(token, config.companyId);
      spinner.stop();

      if (workspaces.length === 0) throw new Error("当前 company_id 下没有可用空间");

      const workspaceId = await select({
        message: "选择默认空间",
        choices: workspaces.map((workspace) => ({
          name: `${workspace.name} (${workspace.id})`,
          value: workspace.id
        }))
      });
      const workspace = workspaces.find((item) => item.id === workspaceId)!;
      await saveConfig({
        ...config,
        defaultWorkspaceId: workspace.id,
        defaultWorkspaceName: workspace.name
      });
      success(`默认空间：${workspace.name} (${workspace.id})`);
    });
}

function upsertWorkspace(
  current: Array<{ id: string; name: string; companyId?: string }> | undefined,
  workspace: { id: string; name: string; companyId?: string }
) {
  const next = (current ?? []).filter((item) => item.id !== workspace.id);
  next.push(workspace);
  return next;
}
