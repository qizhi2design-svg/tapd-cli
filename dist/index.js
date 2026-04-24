#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { registerAuth } from "./commands/auth.js";
import { registerComment } from "./commands/comment.js";
import { registerInit } from "./commands/init.js";
import { registerStory } from "./commands/story.js";
import { registerWorkspace } from "./commands/workspace.js";
import { brand, fail } from "./ui.js";
const program = new Command();
program
    .name("tapd")
    .description("用本地 Markdown 管理 TAPD 需求、迭代空间和评论")
    .version("0.1.0")
    .showHelpAfterError("(使用 tapd -h 查看帮助)")
    .configureHelp({
    styleTitle: (str) => chalk.cyan.bold(str),
    styleCommandText: (str) => chalk.green(str),
    styleOptionText: (str) => chalk.yellow(str),
    styleArgumentText: (str) => chalk.magenta(str),
    sortSubcommands: true,
    sortOptions: true
})
    .addHelpText("beforeAll", `${brand()}\n`)
    .addHelpText("after", `
${chalk.cyan.bold("常用流程")}
  ${chalk.gray("1.")} tapd auth bind
  ${chalk.gray("2.")} tapd init
  ${chalk.gray("3.")} tapd story create ./需求.md
  ${chalk.gray("4.")} tapd story update ./需求.md
  ${chalk.gray("5.")} tapd comment add ./需求.md --message "已评审"

${chalk.cyan.bold("Markdown frontmatter 示例")}
  ---
  title: "需求标题"
  label: "local-md|cli"
  status: "planning"
  ---
`);
registerAuth(program);
registerInit(program);
registerWorkspace(program);
registerStory(program);
registerComment(program);
program.parseAsync(process.argv).catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map