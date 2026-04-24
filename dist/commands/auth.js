import { input, password, select } from "@inquirer/prompts";
import ora from "ora";
import { TapdClient } from "../api.js";
import { loadConfig, saveConfig, saveCredentials } from "../config.js";
import { currentWorkspaceHelpText, exitHint, maskSecret, success } from "../ui.js";
export function registerAuth(program) {
    const auth = program
        .command("auth")
        .description("授权与凭证管理")
        .addHelpCommand(false)
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .addHelpText("after", `
示例：
  tapd auth bind
  tapd auth bind --mode app --client-id tapd-app-xxx --company-id 41988264
  tapd auth bind --mode personal --personal-token *** --workspace-id 58491787

说明：
  凭证保存到 .tapd/credentials.json，company_id 保存到 .tapd/config.json。
`);
    auth
        .command("bind")
        .description("绑定 TAPD 应用凭证或个人令牌")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .option("--mode <mode>", "认证模式：app 或 personal")
        .option("--client-id <id>", "TAPD 应用 ID")
        .option("--client-secret <secret>", "TAPD 应用密钥")
        .option("--personal-token <token>", "TAPD 个人令牌")
        .option("--company-id <id>", "TAPD 企业 ID")
        .option("--workspace-id <id>", "个人令牌验证用 workspace_id")
        .addHelpText("after", `
示例：
  tapd auth bind
  tapd auth bind --mode app --client-id tapd-app-xxx --client-secret *** --company-id 41988264
  tapd auth bind --mode personal --personal-token *** --workspace-id 58491787
`)
        .action(async (options) => {
        if (!options.mode) {
            exitHint();
        }
        const mode = (options.mode ?? await select({
            message: "选择认证方式",
            choices: [
                { name: "开放应用凭证 client_id/client_secret", value: "app" },
                { name: "个人令牌 Bearer token", value: "personal" }
            ]
        })).trim();
        if (mode !== "app" && mode !== "personal") {
            throw new Error("--mode 只支持 app 或 personal");
        }
        if (mode === "personal") {
            const personalToken = (options.personalToken ?? await password({
                message: "个人令牌",
                mask: "*",
                validate: (value) => value.trim().length > 0 || "请输入个人令牌"
            })).trim();
            const workspaceId = (options.workspaceId ?? await input({
                message: "验证用 workspace_id",
                required: true
            })).trim();
            const spinner = ora("验证 TAPD 个人令牌").start();
            let workspace;
            try {
                workspace = await new TapdClient().verifyPersonalToken(personalToken, workspaceId);
                spinner.succeed(`个人令牌验证成功：${workspace.name} (${workspace.id})`);
            }
            catch (error) {
                spinner.fail("个人令牌验证失败");
                throw error;
            }
            await saveCredentials({ mode: "personal", personalToken });
            const config = await loadConfig();
            await saveConfig({
                ...config,
                companyId: workspace.companyId ?? config.companyId,
                defaultWorkspaceId: workspace.id,
                defaultWorkspaceName: workspace.name,
                workspaces: upsertWorkspace(config.workspaces, workspace)
            });
            success(`已保存个人令牌：${maskSecret(personalToken)}`);
            if (workspace.companyId)
                success(`已绑定 company_id：${workspace.companyId}`);
            success(`已设置默认空间：${workspace.name} (${workspace.id})`);
            return;
        }
        const clientId = (options.clientId ?? await input({ message: "应用 ID", required: true })).trim();
        const clientSecret = (options.clientSecret ?? await password({
            message: "应用密钥",
            mask: "*",
            validate: (value) => value.trim().length > 0 || "请输入应用密钥"
        })).trim();
        const companyId = (options.companyId ?? await input({ message: "企业 ID company_id", required: true })).trim();
        const spinner = ora("验证 TAPD 凭证").start();
        let token;
        try {
            token = await new TapdClient().requestToken({ clientId, clientSecret });
            spinner.succeed(`凭证验证成功，token 有效期 ${token.expiresIn}s`);
        }
        catch (error) {
            spinner.fail("凭证验证失败");
            throw error;
        }
        await saveCredentials({ mode: "app", clientId, clientSecret });
        const config = await loadConfig();
        await saveConfig({ ...config, companyId });
        success(`已保存应用 ID：${clientId}`);
        success(`已保存应用密钥：${maskSecret(clientSecret)}`);
        success(`已绑定 company_id：${companyId}`);
    });
}
function upsertWorkspace(current, workspace) {
    const next = (current ?? []).filter((item) => item.id !== workspace.id);
    next.push(workspace);
    return next;
}
//# sourceMappingURL=auth.js.map