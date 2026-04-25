import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Option } from "commander";
import ora from "ora";
import { TapdClient } from "../api.js";
import { resolveWorkspaceContext } from "../config.js";
import { markdownToHtml, readMarkdown } from "../markdown.js";
import { getToken } from "../session.js";
import { success, table, truncate, withSpinner, workspaceBanner } from "../ui.js";

async function resolveStoryId(value: string): Promise<{ storyId: string; workspaceId?: string }> {
  if (!existsSync(value)) return { storyId: value };
  const doc = await readMarkdown(value);
  if (!doc.frontmatter.tapd_id) throw new Error("Markdown frontmatter 缺少 tapd_id");
  return { storyId: doc.frontmatter.tapd_id, workspaceId: doc.frontmatter.workspace_id };
}

export function registerComment(program: import("commander").Command): void {
  const comment = program
    .command("comment")
    .description("TAPD 需求评论")
    .addHelpCommand(false)
    .addHelpText("after", `
示例：
  tapd comment add ./需求.md --message "已评审"
  tapd comment add 1147232921001000017 --file ./comment.md
  tapd comment list ./需求.md
`);

  comment
    .command("add")
    .argument("<markdown-file-or-story-id>", "Markdown 文件或 TAPD 需求 ID")
    .description("添加需求评论")
    .addOption(new Option("-m, --message <text>", "评论 Markdown 文本").conflicts("file"))
    .addOption(new Option("-f, --file <file>", "评论 Markdown 文件").conflicts("message"))
    .option("-w, --workspace-id <id>", "覆盖 workspace_id")
    .option("-a, --author <author>", "评论作者")
    .addHelpText("after", `
示例：
  tapd comment add ./需求.md --message "已完成评审"
  tapd comment add 1147232921001000017 --file ./comment.md --author 黄启智

说明：
  评论内容会从 Markdown 转成 HTML 后写入 TAPD。
`)
    .action(async (target: string, options: { message?: string; file?: string; workspaceId?: string; author?: string }) => {
      const resolved = await resolveStoryId(target);
      const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId ?? resolved.workspaceId);
      workspaceBanner(workspace);
      const workspaceId = workspace.id;
      const source = options.file ? await readFile(options.file, "utf8") : options.message;
      if (!source) throw new Error("请通过 --message 或 --file 提供评论内容");
      const html = await markdownToHtml(source);
      const client = new TapdClient();
      const token = await getToken(client);
      const spinner = ora("添加评论").start();
      const created = await withSpinner(spinner, () => client.addComment(token, {
        workspace_id: workspaceId,
        entry_type: "stories",
        entry_id: resolved.storyId,
        author: options.author,
        description: html
      }), {
        successText: "评论添加成功",
        failText: "评论添加失败"
      });
      success(`${created.id} ${created.created ?? ""}`.trim());
    });

  comment
    .command("list")
    .argument("<markdown-file-or-story-id>", "Markdown 文件或 TAPD 需求 ID")
    .description("查看需求评论")
    .option("-w, --workspace-id <id>", "覆盖 workspace_id")
    .addHelpText("after", `
示例：
  tapd comment list ./需求.md
  tapd comment list 1147232921001000017 --workspace-id 47232921
`)
    .action(async (target: string, options: { workspaceId?: string }) => {
      const resolved = await resolveStoryId(target);
      const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId ?? resolved.workspaceId);
      workspaceBanner(workspace);
      const workspaceId = workspace.id;
      const client = new TapdClient();
      const token = await getToken(client);
      const comments = await client.listComments(token, workspaceId, resolved.storyId);
      table(comments.map((item) => ({
        id: item.id,
        author: item.author,
        created: item.created,
        comment: truncate(item.description, 100)
      })));
    });
}
