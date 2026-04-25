#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { registerLogin, registerLogout } from "./commands/auth.js";
import { registerComment } from "./commands/comment.js";
import { registerInfo } from "./commands/info.js";
import { registerInit } from "./commands/init.js";
import { registerIteration } from "./commands/iteration.js";
import { registerStory } from "./commands/story.js";
import { registerUpdate } from "./commands/update.js";
import { registerWorkspace } from "./commands/workspace.js";
import { COPY } from "./command-text.js";
import { currentVersionHelpText, currentWorkspaceHelpText, fail } from "./ui.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
const packageName = packageJson.name;
const version = packageJson.version;
const program = new Command();
program
    .name("tapd")
    .description(COPY.rootDescription)
    .version(version)
    .addHelpCommand(false)
    .showHelpAfterError("(使用 tapd -h 查看帮助)")
    .configureHelp({
    styleTitle: (str) => chalk.cyan.bold(str),
    styleCommandText: (str) => chalk.green(str),
    styleOptionText: (str) => chalk.yellow(str),
    styleArgumentText: (str) => chalk.magenta(str),
    sortSubcommands: false,
    sortOptions: true,
    showGlobalOptions: true,
    subcommandTerm: (cmd) => cmd.name()
})
    .configureOutput({
    writeOut: (str) => {
        // 隐藏 "Available commands in all" 标题
        const filtered = str.replace(/Available commands in all.*?\n/g, "");
        const contextBlock = `${currentVersionHelpText()}\n${currentWorkspaceHelpText()}\n`;
        const reordered = filtered.replace(/(Usage:\s[^\n]+\n(?:\n[^\n]+\n)?)/, `$1\n${contextBlock}\n`);
        process.stdout.write(reordered);
    },
    writeErr: (str) => process.stderr.write(str)
})
    .addHelpText("after", `\n${COPY.rootHelpAfter.trim()}\n`);
registerLogin(program);
registerInit(program);
registerInfo(program);
registerUpdate(program, { packageName, currentVersion: version });
registerStory(program);
registerIteration(program);
registerComment(program);
registerWorkspace(program);
registerLogout(program);
program.parseAsync(process.argv).catch((error) => {
    // 用户按 Ctrl+C 退出时静默处理
    if (error instanceof Error && error.message.includes("force closed the prompt")) {
        process.exit(0);
    }
    fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map