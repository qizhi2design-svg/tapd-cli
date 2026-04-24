import { input, select } from "@inquirer/prompts";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import ora from "ora";
import { isStoryNotFoundError, TapdClient } from "../api.js";
import { resolveWorkspaceContext, loadConfig } from "../config.js";
import { convertLocalImageReferences, hasLocalImageReferences, imageDataUri as localImageDataUri, stripLocalDocumentLinks } from "../local-assets.js";
import { convertMermaidBlocks, hasMermaidBlocks, imageDataUri as mermaidImageDataUri } from "../mermaid.js";
import { htmlToMarkdown, markdownToHtml, readMarkdown, titleFromDocument, writeMarkdown, writeFrontmatter } from "../markdown.js";
import { getToken } from "../session.js";
import { currentWorkspaceHelpText, exitHint, info, success, table, truncate, withSpinner, workspaceBanner } from "../ui.js";
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
function hasUploadableLocalResources(content) {
    return hasMermaidBlocks(content) || hasLocalImageReferences(content);
}
function renderPreparedImages(templateContent, images, imageSrc) {
    let content = templateContent;
    for (const image of images) {
        const src = imageSrc(image);
        const replacement = src
            ? `<p><img src="${src}" alt="${escapeHtmlAttribute(image.alt)}" style="max-width:100%;" /></p>`
            : `<p>${escapeHtml(image.alt)}</p>`;
        content = content.split(image.placeholder).join(replacement);
    }
    return content;
}
async function prepareUploadableLocalResources(client, token, doc, content, workspaceId, storyId, owner) {
    const localImages = await convertLocalImageReferences(content, {
        client,
        token,
        workspaceId,
        storyId,
        markdownFile: doc.path,
        owner
    });
    const mermaid = await convertMermaidBlocks(localImages.templateContent, {});
    const images = [
        ...localImages.images.map((image) => ({
            key: `local:${image.index}`,
            placeholder: image.placeholder,
            base64: image.base64,
            alt: image.alt || image.sourcePath,
            dataUri: localImageDataUri(image.base64, image.sourcePath)
        })),
        ...mermaid.images.map((image) => ({
            key: `mermaid:${image.index}`,
            placeholder: image.placeholder,
            base64: image.base64,
            alt: `Mermaid diagram ${image.index}`,
            dataUri: mermaidImageDataUri(image.base64)
        }))
    ];
    return {
        content: renderPreparedImages(mermaid.templateContent, images, (image) => image.dataUri),
        templateContent: mermaid.templateContent,
        images
    };
}
async function updateStoryFromMarkdown(client, token, payload, doc, workspaceId, storyId, owner) {
    const content = stripLocalDocumentLinks(doc.content);
    if (!hasUploadableLocalResources(content)) {
        return client.updateStory(token, {
            ...payload,
            description: await markdownToHtml(content)
        });
    }
    const prepared = await prepareUploadableLocalResources(client, token, doc, content, workspaceId, storyId, owner);
    const templateHtml = await markdownToHtml(prepared.templateContent);
    // 分离需要上传的本地图片和直接使用 data URI 的 mermaid 图片
    const localImagesToUpload = prepared.images.filter((img) => img.key.startsWith('local:'));
    const mermaidImages = prepared.images.filter((img) => img.key.startsWith('mermaid:'));
    // 如果没有需要上传的本地图片，直接使用 data URI
    if (localImagesToUpload.length === 0) {
        const finalContent = renderPreparedImages(templateHtml, prepared.images, (image) => image.dataUri);
        return client.updateStory(token, {
            ...payload,
            description: finalContent
        });
    }
    // 只对本地图片进行上传和路径解析
    const resolvedSources = new Map();
    // mermaid 图片直接使用 data URI
    for (const image of mermaidImages) {
        resolvedSources.set(image.key, image.dataUri);
    }
    // 本地图片需要上传到 TAPD
    for (const image of localImagesToUpload) {
        const stepContent = renderPreparedImages(templateHtml, prepared.images, (item) => {
            if (resolvedSources.has(item.key))
                return resolvedSources.get(item.key);
            if (item.key === image.key)
                return item.dataUri;
            return undefined;
        });
        await client.updateStory(token, {
            ...payload,
            description: stepContent
        });
        const story = await client.getStory(token, workspaceId, storyId);
        const known = new Set(resolvedSources.values());
        const nextSource = extractTapdImageSources(story.description).find((src) => !known.has(src));
        if (!nextSource)
            throw new Error(`${image.alt} 上传后未找到 TAPD 图片路径`);
        resolvedSources.set(image.key, nextSource);
    }
    const finalContent = renderPreparedImages(templateHtml, prepared.images, (image) => {
        return resolvedSources.get(image.key);
    });
    return client.updateStory(token, {
        ...payload,
        description: finalContent
    });
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
function escapeHtmlAttribute(value) {
    return escapeHtml(value).replaceAll("\"", "&quot;");
}
async function createStoryFromMarkdown(file, doc, client, token, workspaceId, iterationId, creator, spinner) {
    const content = stripLocalDocumentLinks(doc.content);
    const created = await client.createStory(token, {
        workspace_id: workspaceId,
        name: titleFromDocument(doc),
        description: await markdownToHtml(content),
        iteration_id: iterationId,
        creator,
        owner: doc.frontmatter.owner,
        label: doc.frontmatter.label,
        status: doc.frontmatter.status
    });
    let finalModified = created.modified;
    if (hasUploadableLocalResources(content)) {
        if (spinner)
            spinner.text = "上传本地图片资源并更新需求";
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
        .addHelpCommand(false)
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .addHelpText("after", `
示例：
  tapd story create ./需求.md
  tapd story update ./需求.md
  tapd story get 1147232921001000017
  tapd story pull 1147232921001000017

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
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
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
        const stories = await withSpinner(spinner, () => client.listStories(token, {
            workspaceId,
            limit,
            status,
            iterationId,
            label
        }), {
            successText: "查询完成",
            failText: "查询 TAPD 需求失败"
        });
        success(`共 ${stories.length} 条`);
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
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
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
        // 获取配置中的默认创建人
        const config = await loadConfig();
        const defaultCreator = config.defaultCreator;
        if (!doc.frontmatter.iteration_id || (!doc.frontmatter.creator && !defaultCreator)) {
            exitHint();
        }
        const iterationId = doc.frontmatter.iteration_id ?? await chooseIteration(client, token, workspaceId);
        const creator = doc.frontmatter.creator ?? defaultCreator ?? await chooseCreator(client, token, workspaceId);
        const spinner = ora("创建 TAPD 需求").start();
        const created = await withSpinner(spinner, () => createStoryFromMarkdown(file, doc, client, token, workspaceId, iterationId, creator, spinner), { successText: "需求创建成功", failText: "创建 TAPD 需求失败" });
        success(`${created.name} (${created.id})`);
    });
    story
        .command("update")
        .argument("<markdown-file>", "本地 Markdown 文件")
        .description("根据 Markdown frontmatter 更新 TAPD 需求")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
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
        const tapdId = doc.frontmatter.tapd_id;
        const workspace = await resolveWorkspaceContext(process.cwd(), doc.frontmatter.workspace_id ?? options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const spinner = ora("更新 TAPD 需求").start();
        const updated = await withSpinner(spinner, async () => {
            if (hasUploadableLocalResources(doc.content))
                spinner.text = "上传本地图片资源并更新需求";
            try {
                await client.getStory(token, workspaceId, tapdId);
                return await updateStoryFromMarkdown(client, token, {
                    id: tapdId,
                    workspace_id: workspaceId,
                    name: titleFromDocument(doc),
                    iteration_id: doc.frontmatter.iteration_id,
                    creator: doc.frontmatter.creator,
                    owner: doc.frontmatter.owner,
                    label: doc.frontmatter.label,
                    status: doc.frontmatter.status
                }, doc, workspaceId, tapdId, doc.frontmatter.creator);
            }
            catch (error) {
                if (!isStoryNotFoundError(error, tapdId))
                    throw error;
                spinner.text = "TAPD 需求不存在，重新创建需求";
                return await createStoryFromMarkdown(file, doc, client, token, workspaceId, doc.frontmatter.iteration_id, doc.frontmatter.creator, spinner);
            }
        }, { successText: "需求更新成功", failText: "更新 TAPD 需求失败" });
        await writeFrontmatter(file, {
            workspace_id: workspaceId,
            tapd_id: updated.id,
            updated_at: updated.modified ?? new Date().toISOString()
        });
        success(`${updated.name} (${updated.id})`);
    });
    story
        .command("get")
        .argument("<story-id>", "TAPD 需求 ID")
        .description("获取需求内容摘要")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
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
    story
        .command("pull")
        .argument("<story-id>", "TAPD 需求 ID")
        .argument("[output-file]", "输出 Markdown 文件路径，默认为 <story-id>.md")
        .description("拉取指定需求并转换为 Markdown 文件")
        .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
        .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
        .addHelpText("after", `
示例：
  tapd story pull 1147232921001000017
  tapd story pull 1147232921001000017 ./需求.md
  tapd story pull 1147232921001000017 --workspace-id 47232921

说明：
  会自动下载需求中的图片到 <output-file-dir>/assets/ 目录
  并将 Markdown 中的图片链接替换为本地相对路径
`)
        .action(async (storyId, outputFile, options) => {
        const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId);
        workspaceBanner(workspace);
        const workspaceId = workspace.id;
        const client = new TapdClient();
        const token = await getToken(client);
        const spinner = ora("拉取 TAPD 需求").start();
        const storyData = await withSpinner(spinner, () => client.getStory(token, workspaceId, storyId), {
            successText: "需求拉取成功",
            failText: "拉取 TAPD 需求失败"
        });
        const filePath = outputFile || `${storyId}.md`;
        const fileDir = dirname(filePath);
        const assetsDir = join(fileDir, "assets");
        // 提取所有 TAPD 图片链接
        const imageRegex = /!\[([^\]]*)\]\((\/tfl\/captures\/[^)]+)\)/g;
        const images = [];
        let match;
        const content = storyData.description ? htmlToMarkdown(storyData.description) : "";
        while ((match = imageRegex.exec(content)) !== null) {
            images.push({
                alt: match[1],
                url: match[2],
                match: match[0]
            });
        }
        let finalContent = content;
        if (images.length > 0) {
            spinner.start(`下载 ${images.length} 张图片`);
            await withSpinner(spinner, async () => {
                await mkdir(assetsDir, { recursive: true });
                for (let i = 0; i < images.length; i++) {
                    const image = images[i];
                    const ext = image.url.match(/\.(\w+)$/)?.[1] || "png";
                    const filename = `image-${i + 1}.${ext}`;
                    const localPath = join(assetsDir, filename);
                    const relativePath = `./assets/${filename}`;
                    try {
                        const attachment = await client.getImage(token, {
                            workspaceId,
                            imagePath: image.url
                        });
                        if (!attachment.download_url) {
                            throw new Error("download_url 缺失");
                        }
                        const response = await fetch(attachment.download_url);
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}`);
                        }
                        const buffer = await response.arrayBuffer();
                        await writeFile(localPath, Buffer.from(buffer));
                        // 替换 Markdown 中的链接
                        finalContent = finalContent.replace(image.match, `![${image.alt}](${relativePath})`);
                    }
                    catch (error) {
                        spinner.warn(`图片下载失败: ${image.url} - ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }, { successText: `已下载 ${images.length} 张图片到 ${assetsDir}`, failText: "下载需求图片失败" });
        }
        const frontmatter = {
            tapd_id: storyData.id,
            title: storyData.name,
            workspace_id: workspaceId,
            iteration_id: storyData.iteration_id && storyData.iteration_id !== "0" ? storyData.iteration_id : undefined,
            creator: storyData.creator,
            owner: storyData.owner,
            label: storyData.label,
            status: storyData.status,
            created_at: storyData.created,
            updated_at: storyData.modified
        };
        await writeMarkdown(filePath, frontmatter, finalContent);
        success(`已保存到 ${filePath}`);
    });
}
//# sourceMappingURL=story.js.map