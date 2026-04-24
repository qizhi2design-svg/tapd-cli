import { COPY } from "../command-text.js";
import { loadConfig, loadCredentials } from "../config.js";
import { currentWorkspaceHelpText, info, success } from "../ui.js";
export function registerInfo(program) {
    program
        .command("info")
        .description(COPY.infoDescription)
        .addHelpCommand(false)
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .addHelpText("after", `\n${COPY.infoHelpAfter}`)
        .action(async () => {
        const [config, credentials] = await Promise.all([
            loadConfig(),
            loadCredentials().catch(() => undefined)
        ]);
        const authMode = credentials?.mode === "personal"
            ? "个人令牌"
            : credentials?.mode === "app"
                ? "开放应用"
                : undefined;
        const workspaceName = config.defaultWorkspaceName ?? "未设置";
        const workspaceId = config.defaultWorkspaceId ?? "未设置";
        const creator = config.defaultCreator ?? "未设置";
        const companyId = config.companyId ?? "未设置";
        if (credentials) {
            success("当前已授权");
        }
        else {
            info("当前未授权");
        }
        info(`授权方式：${authMode ?? "未设置"}`);
        info(`当前空间：${workspaceName} (${workspaceId})`);
        info(`默认创建人：${creator}`);
        info(`company_id：${companyId}`);
    });
}
//# sourceMappingURL=info.js.map