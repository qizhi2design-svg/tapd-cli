import { input, select } from "@inquirer/prompts";
import ora from "ora";
import { isStoryNotFoundError, TapdClient } from "../api.js";
import { resolveWorkspaceContext } from "../config.js";
import { convertMermaidBlocks, hasMermaidBlocks, imageDataUri, renderMermaidTemplate } from "../mermaid.js";
import { markdownToHtml, readMarkdown, titleFromDocument, writeFrontmatter } from "../markdown.js";
import { getToken } from "../session.js";
import { info, success, table, truncate, workspaceBanner } from "../ui.js";
async function chooseIteration(client, token, workspaceId) {
    const iterations = await client.listIterations(token, workspaceId);
    if (iterations.length === 0)
        return undefined;
    return select({
        message: "选择迭代",
        choices: [
            { name: "不关联迭代", value: "" },
            ...iterations.map((item) => ({
                name: `${item.name} (${item.id}) ${item.status ?? ""}`.trim(),
                value: item.id
            }))
        ]
    });
}
async function chooseCreator(client, token, workspaceId) {
    const users = await client.listUsers(token, workspaceId);
    if (users.length === 0)
        return undefined;
    return select({
        message: "选择创建人",
        choices: users.map((item) => ({
            name: `${item.user}${item.name ? ` - ${item.name}` : ""}`,
            value: item.user
        }))
    });
}
function extractTapdImageSources(html = "") {
    return [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((src) => src.startsWith("/tfl/captures/"));
}
async function updateStoryFromMarkdown(client, token, payload, doc, workspaceId, storyId, owner) {
    if (!hasMermaidBlocks(doc.content)) {
        return client.updateStory(token, {
            ...payload,
            description: doc.html
        });
    }
    const converted = await convertMermaidBlocks(doc.content, {
        client,
        token,
        workspaceId,
        storyId,
        owner
    });
    if (converted.images.length <= 1) {
        return client.updateStory(token, {
            ...payload,
            description: await markdownToHtml(converted.content)
        });
    }
    const resolvedSources = new Map();
    for (const image of converted.images) {
        const stepContent = renderMermaidTemplate(converted.templateContent, converted.images, (item) => {
            if (resolvedSources.has(item.index))
                return resolvedSources.get(item.index);
            if (item.index === image.index)
                return imageDataUri(item.base64);
            return undefined;
        });
        await client.updateStory(token, {
            ...payload,
            description: await markdownToHtml(stepContent)
        });
        const story = await client.getStory(token, workspaceId, storyId);
        const known = new Set(resolvedSources.values());
        const nextSource = extractTapdImageSources(story.description).find((src) => !known.has(src));
        if (!nextSource)
            throw new Error(`Mermaid 图片 ${image.index} 上传后未找到 TAPD 图片路径`);
        resolvedSources.set(image.index, nextSource);
    }
    const finalContent = renderMermaidTemplate(converted.templateContent, converted.images, (image) => {
        return resolvedSources.get(image.index);
    });
    return client.updateStory(token, {
        ...payload,
        description: await markdownToHtml(finalContent)
    });
}
async function createStoryFromMarkdown(file, doc, client, token, workspaceId, iterationId, creator, spinner) {
    const created = await client.createStory(token, {
        workspace_id: workspaceId,
        name: titleFromDocument(doc),
        description: doc.html,
        iteration_id: iterationId,
        creator,
        owner: doc.frontmatter.owner,
        label: doc.frontmatter.label,
        status: doc.frontmatter.status
    });
    let finalModified = created.modified;
    if (hasMermaidBlocks(doc.content)) {
        if (spinner)
            spinner.text = "转换 Mermaid 图片并更新需求";
        const updated = await updateStoryFromMarkdown(client, token, {
            id: created.id,
            workspace_id: workspaceId,
            name: titleFromDocument(doc),
            iteration_id: iterationId,
            creator,
            owner: doc.frontmatter.owner,
            label: doc.frontmatter.label,
            status: doc.frontmatter.status
        }, doc, workspaceId, created.id, creator);
        finalModified = updated.modified;
    }
    await writeFrontmatter(file, {
        ...doc.frontmatter,
        tapd_id: created.id,
        workspace_id: workspaceId,
        iteration_id: iterationId || doc.frontmatter.iteration_id,
        creator: creator || doc.frontmatter.creator,
        created_at: created.created ?? new Date().toISOString(),
        updated_at: finalModified
    });
    return {
        ...created,
        modified: finalModified ?? created.modified
    };
}
export function registerStory(program) {
    const story = program
        .command("story")
        .description("TAPD 需求管理")
        .addHelpText("after", `
示例：
  tapd story create ./需求.md
  tapd story update ./需求.md
  tapd story get 1147232921001000017

Markdown frontmatter：
  ---
  title: "需求标题"
  iteration_id: "1147232921001000005"
  creator: "黄启智"
  label: "local-md|cli"
  status: "planning"
  ---
`);
    story
        .command("list")
        .description("查询需求列表，默认加载全部，也可交互选择分类")
        .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
        .option("-s, --status <status>", "按状态筛选，例如 planning")
        .option("-i, --iteration-id <id>", "按迭代 ID 筛选")
        .option("-l, --label <label>", "按标签筛选")
        .option("--all", "直接加载全部，跳过交互分类选择")
        .option("--limit <number>", "返回数量，默认 100", "100")
        .addHelpText("after", `
示例：
  tapd story list
  tapd story list --all
  tapd story list --status planning
  tapd story list --iteration-id 1147232921001000005
  tapd story list --label html-richtext

说明：
  不传筛选参数时，会出现分类下拉：全部、状态、迭代、标签。
  默认选“全部”，最多返回 --limit 条。
`)
        .action(async (options) => {
        const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        let status = options.status;
        let iterationId = options.iterationId;
        let label = options.label;
        const hasExplicitFilter = Boolean(status || iterationId || label || options.all);
        if (!hasExplicitFilter) {
            const category = await select({
                message: "选择需求分类",
                default: "all",
                choices: [
                    { name: "全部需求", value: "all" },
                    { name: "按状态筛选", value: "status" },
                    { name: "按迭代筛选", value: "iteration" },
                    { name: "按标签筛选", value: "label" }
                ]
            });
            if (category === "status") {
                status = await select({
                    message: "选择状态",
                    choices: [
                        { name: "规划中 planning", value: "planning" },
                        { name: "开发中 developing", value: "developing" },
                        { name: "已实现 resolved", value: "resolved" },
                        { name: "已拒绝 rejected", value: "rejected" },
                        { name: "自定义输入", value: "__custom__" }
                    ]
                });
                if (status === "__custom__")
                    status = await input({ message: "输入状态值", required: true });
            }
            else if (category === "iteration") {
                const iterations = await client.listIterations(token, workspaceId);
                iterationId = await select({
                    message: "选择迭代",
                    choices: iterations.map((item) => ({
                        name: `${item.name} (${item.id}) ${item.status ?? ""}`.trim(),
                        value: item.id
                    }))
                });
            }
            else if (category === "label") {
                label = await input({ message: "输入标签", required: true });
            }
        }
        const limit = Number.parseInt(options.limit ?? "100", 10);
        if (!Number.isFinite(limit) || limit <= 0)
            throw new Error("--limit 必须是正整数");
        const spinner = ora("查询 TAPD 需求").start();
        const stories = await client.listStories(token, {
            workspaceId,
            limit,
            status,
            iterationId,
            label
        });
        spinner.succeed(`查询完成，共 ${stories.length} 条`);
        table(stories.map((item) => ({
            id: item.id,
            title: truncate(item.name, 36),
            status: item.status,
            iteration: item.iteration_id && item.iteration_id !== "0" ? item.iteration_id : "",
            label: truncate(item.label, 24),
            modified: item.modified
        })));
    });
    story
        .command("create")
        .argument("<markdown-file>", "本地 Markdown 文件")
        .description("从 Markdown 创建 TAPD 需求，并写回 tapd_id")
        .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
        .addHelpText("after", `
示例：
  tapd story create ./需求.md
  tapd story create ./需求.md --workspace-id 47232921

行为：
  缺少 iteration_id 或 creator 时，会交互式拉取 TAPD 数据并下拉选择。
  创建成功后会写回 tapd_id、workspace_id、created_at。
`)
        .action(async (file, options) => {
        const doc = await readMarkdown(file);
        const workspace = await resolveWorkspaceContext(process.cwd(), doc.frontmatter.workspace_id ?? options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const iterationId = doc.frontmatter.iteration_id ?? await chooseIteration(client, token, workspaceId);
        const creator = doc.frontmatter.creator ?? await chooseCreator(client, token, workspaceId);
        const spinner = ora("创建 TAPD 需求").start();
        const created = await createStoryFromMarkdown(file, doc, client, token, workspaceId, iterationId, creator, spinner);
        spinner.succeed("需求创建成功");
        success(`${created.name} (${created.id})`);
    });
    story
        .command("update")
        .argument("<markdown-file>", "本地 Markdown 文件")
        .description("根据 Markdown frontmatter 更新 TAPD 需求")
        .option("-w, --workspace-id <id>", "覆盖 workspace_id")
        .addHelpText("after", `
示例：
  tapd story update ./需求.md

要求：
  Markdown frontmatter 必须已有 tapd_id。
`)
        .action(async (file, options) => {
        const doc = await readMarkdown(file);
        if (!doc.frontmatter.tapd_id)
            throw new Error("Markdown frontmatter 缺少 tapd_id，无法更新");
        const workspace = await resolveWorkspaceContext(process.cwd(), doc.frontmatter.workspace_id ?? options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const spinner = ora("更新 TAPD 需求").start();
        if (hasMermaidBlocks(doc.content))
            spinner.text = "转换 Mermaid 图片并更新需求";
        let updated;
        try {
            await client.getStory(token, workspaceId, doc.frontmatter.tapd_id);
            updated = await updateStoryFromMarkdown(client, token, {
                id: doc.frontmatter.tapd_id,
                workspace_id: workspaceId,
                name: titleFromDocument(doc),
                iteration_id: doc.frontmatter.iteration_id,
                creator: doc.frontmatter.creator,
                owner: doc.frontmatter.owner,
                label: doc.frontmatter.label,
                status: doc.frontmatter.status
            }, doc, workspaceId, doc.frontmatter.tapd_id, doc.frontmatter.creator);
        }
        catch (error) {
            if (!isStoryNotFoundError(error, doc.frontmatter.tapd_id))
                throw error;
            spinner.text = "TAPD 需求不存在，重新创建需求";
            updated = await createStoryFromMarkdown(file, doc, client, token, workspaceId, doc.frontmatter.iteration_id, doc.frontmatter.creator, spinner);
        }
        await writeFrontmatter(file, {
            workspace_id: workspaceId,
            tapd_id: updated.id,
            updated_at: updated.modified ?? new Date().toISOString()
        });
        spinner.succeed("需求更新成功");
        success(`${updated.name} (${updated.id})`);
    });
    story
        .command("get")
        .argument("<story-id>", "TAPD 需求 ID")
        .description("获取需求内容摘要")
        .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
        .addHelpText("after", `
示例：
  tapd story get 1147232921001000017
  tapd story get 1147232921001000017 --workspace-id 47232921
`)
        .action(async (storyId, options) => {
        const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const storyData = await client.getStory(token, workspaceId, storyId);
        table([{
                id: storyData.id,
                title: storyData.name,
                status: storyData.status,
                iteration: storyData.iteration_id,
                label: storyData.label,
                modified: storyData.modified
            }]);
        info(truncate(storyData.description, 300));
    });
}
//# sourceMappingURL=story.js.map