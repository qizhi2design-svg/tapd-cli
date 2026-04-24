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
import { registerWorkspace } from "./commands/workspace.js";
import { COPY } from "./command-text.js";
import { brand, currentWorkspaceHelpText, fail } from "./ui.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
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
        const filtered = str.replace(/Available commands in all.*?\n/g, '');
        process.stdout.write(filtered);
    },
    writeErr: (str) => process.stderr.write(str)
})
    .addHelpText("beforeAll", `${brand()}\n`)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .addHelpText("after", `\n${COPY.rootHelpAfter.trim()}\n`);
registerLogin(program);
registerInit(program);
registerInfo(program);
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