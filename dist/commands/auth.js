import { input, password, select } from "@inquirer/prompts";
import ora from "ora";
import { TapdClient } from "../api.js";
import { COPY } from "../command-text.js";
import { deleteCredentials, loadConfig, saveGlobalConfig, saveGlobalCredentials } from "../config.js";
import { maskSecret, success } from "../ui.js";
export function registerLogin(program) {
    program
        .command("login")
        .description(COPY.loginDescription)
        .addHelpCommand(false)
        .addHelpText("after", `\n${COPY.loginHelpAfter}`)
        .option("--mode <mode>", "认证模式：app 或 personal")
        .option("--client-id <id>", "TAPD 应用 ID")
        .option("--client-secret <secret>", "TAPD 应用密钥")
        .option("--personal-token <token>", "TAPD 个人令牌")
        .option("--company-id <id>", "TAPD 企业 ID")
        .option("--workspace-id <id>", "个人令牌验证用 workspace_id")
        .action(async (options) => {
        const mode = (options.mode ?? await select({
            message: COPY.loginModeMessage,
            choices: [
                { name: COPY.loginModeApp, value: "app" },
                { name: COPY.loginModePersonal, value: "personal" }
            ]
        })).trim();
        if (mode !== "app" && mode !== "personal") {
            throw new Error("--mode 只支持 app 或 personal");
        }
        if (mode === "personal") {
            const personalToken = (options.personalToken ?? await password({
                message: COPY.loginPersonalTokenMessage,
                mask: "*",
                validate: (value) => value.trim().length > 0 || COPY.loginPersonalTokenRequired
            })).trim();
            const workspaceId = (options.workspaceId ?? await input({
                message: COPY.loginWorkspaceIdMessage,
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
            await saveGlobalCredentials({ mode: "personal", personalToken });
            const config = await loadConfig();
            await saveGlobalConfig({
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
        const clientId = (options.clientId ?? await input({ message: COPY.loginClientIdMessage, required: true })).trim();
        const clientSecret = (options.clientSecret ?? await password({
            message: COPY.loginClientSecretMessage,
            mask: "*",
            validate: (value) => value.trim().length > 0 || COPY.loginClientSecretRequired
        })).trim();
        const companyId = (options.companyId ?? await input({ message: COPY.loginCompanyIdMessage, required: true })).trim();
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
        await saveGlobalCredentials({ mode: "app", clientId, clientSecret });
        const config = await loadConfig();
        await saveGlobalConfig({ ...config, companyId });
        success(`已保存应用 ID：${clientId}`);
        success(`已保存应用密钥：${maskSecret(clientSecret)}`);
        success(`已绑定 company_id：${companyId}`);
    });
}
export function registerLogout(program) {
    program
        .command("logout")
        .description(COPY.logoutDescription)
        .action(async () => {
        await deleteCredentials();
        success("已清除全局认证文件：~/.tapd/credentials.json");
    });
}
function upsertWorkspace(current, workspace) {
    const next = (current ?? []).filter((item) => item.id !== workspace.id);
    next.push(workspace);
    return next;
}
//# sourceMappingURL=auth.js.map