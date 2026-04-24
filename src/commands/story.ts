import { input, select } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import ora from "ora";
import { isStoryNotFoundError, TapdClient } from "../api.js";
import { COPY } from "../command-text.js";
import { requireWorkspace, resolveWorkspaceContext, loadConfig } from "../config.js";
import {
  convertLocalImageReferences,
  hasLocalImageReferences,
  imageDataUri as localImageDataUri,
  stripLocalDocumentLinks
} from "../local-assets.js";
import { convertMermaidBlocks, hasMermaidBlocks, imageDataUri as mermaidImageDataUri } from "../mermaid.js";
import { htmlToMarkdown, markdownToHtml, readMarkdown, titleFromDocument, writeMarkdown, writeFrontmatter } from "../markdown.js";
import { getToken } from "../session.js";
import { iterationStatusLabel, storyStatusLabel } from "../status.js";
import { formatTaskSummary, loadTasks, renderTaskList } from "../task-view.js";
import type { Story, StoryFrontmatter } from "../types.js";
import { compactList, currentWorkspaceHelpText, info, success, table, truncate, withSpinner, workspaceBanner } from "../ui.js";

type StoryListOptions = {
  workspaceId?: string;
  status?: string;
  iterationId?: string;
  label?: string;
  all?: boolean;
  limit?: string;
};

type StoryTasksOptions = {
  workspaceId?: string;
  status?: string;
  owner?: string;
  all?: boolean;
  limit?: string;
};

function selectableIterations<T extends { status?: string }>(iterations: T[]): T[] {
  return iterations.filter((item) => item.status !== "closed" && item.status !== "done");
}

async function chooseIteration(client: TapdClient, token: string, workspaceId: string): Promise<string | undefined> {
  const iterations = selectableIterations(await client.listIterations(token, workspaceId));
  if (iterations.length === 0) return undefined;
  return select({
    message: COPY.storySelectIterationMessage,
    choices: [
      { name: COPY.storyNoIteration, value: "" },
      ...iterations.map((item) => ({
        name: `${item.name} (${item.id}) ${iterationStatusLabel(item.status)}`.trim(),
        value: item.id
      }))
    ]
  });
}

async function chooseCreator(client: TapdClient, token: string, workspaceId: string): Promise<string | undefined> {
  const users = await client.listUsers(token, workspaceId);
  if (users.length === 0) return undefined;
  return select({
    message: COPY.storySelectCreatorMessage,
    choices: users.map((item) => ({
      name: `${item.user}${item.name ? ` - ${item.name}` : ""}`,
      value: item.user
    }))
  });
}

async function resolveStoryTarget(value: string): Promise<{ storyId: string; workspaceId?: string }> {
  if (!existsSync(value)) return { storyId: value };
  const doc = await readMarkdown(value);
  if (!doc.frontmatter.tapd_id) throw new Error("Markdown frontmatter 缺少 tapd_id");
  return { storyId: doc.frontmatter.tapd_id, workspaceId: doc.frontmatter.workspace_id };
}

function renderStoryList(stories: Story[]): void {
  compactList(
    stories.map((item) => {
      return {
        title: `${truncate(item.name, 72)} (${item.id})`
      };
    })
  );
}

function extractTapdImageSources(html = ""): string[] {
  return [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((src) => src.startsWith("/tfl/captures/"));
}

type PreparedImage = {
  key: string;
  placeholder: string;
  base64: string;
  alt: string;
  dataUri: string;
};

function hasUploadableLocalResources(content: string): boolean {
  return hasMermaidBlocks(content) || hasLocalImageReferences(content);
}

function renderPreparedImages(
  templateContent: string,
  images: PreparedImage[],
  imageSrc: (image: PreparedImage) => string | undefined
): string {
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

async function prepareUploadableLocalResources(
  client: TapdClient,
  token: string,
  doc: Awaited<ReturnType<typeof readMarkdown>>,
  content: string,
  workspaceId: string,
  storyId: string,
  owner?: string
): Promise<{
  content: string;
  templateContent: string;
  images: PreparedImage[];
}> {
  const localImages = await convertLocalImageReferences(content, {
    client,
    token,
    workspaceId,
    storyId,
    markdownFile: doc.path,
    owner
  });
  const mermaid = await convertMermaidBlocks(localImages.templateContent, {});
  const images: PreparedImage[] = [
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

async function updateStoryFromMarkdown(
  client: TapdClient,
  token: string,
  payload: Record<string, string | undefined>,
  doc: Awaited<ReturnType<typeof readMarkdown>>,
  workspaceId: string,
  storyId: string,
  owner?: string
): Promise<Story> {
  const content = stripLocalDocumentLinks(doc.content);
  if (!hasUploadableLocalResources(content)) {
    return client.updateStory(token, {
      ...payload,
      description: await markdownToHtml(content)
    });
  }

  const prepared = await prepareUploadableLocalResources(
    client,
    token,
    doc,
    content,
    workspaceId,
    storyId,
    owner
  );

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
  const resolvedSources = new Map<string, string>();

  // mermaid 图片直接使用 data URI
  for (const image of mermaidImages) {
    resolvedSources.set(image.key, image.dataUri);
  }

  // 本地图片需要上传到 TAPD
  for (const image of localImagesToUpload) {
    const stepContent = renderPreparedImages(templateHtml, prepared.images, (item) => {
      if (resolvedSources.has(item.key)) return resolvedSources.get(item.key);
      if (item.key === image.key) return item.dataUri;
      return undefined;
    });
    await client.updateStory(token, {
      ...payload,
      description: stepContent
    });
    const story = await client.getStory(token, workspaceId, storyId);
    const known = new Set(resolvedSources.values());
    const nextSource = extractTapdImageSources(story.description).find((src) => !known.has(src));
    if (!nextSource) throw new Error(`${image.alt} 上传后未找到 TAPD 图片路径`);
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll("\"", "&quot;");
}

async function createStoryFromMarkdown(
  file: string,
  doc: Awaited<ReturnType<typeof readMarkdown>>,
  client: TapdClient,
  token: string,
  workspaceId: string,
  iterationId?: string,
  creator?: string,
  spinner?: ReturnType<typeof ora>
): Promise<Story> {
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
    if (spinner) spinner.text = "上传本地图片资源并更新需求";
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

export function registerStory(program: import("commander").Command): void {
  const story = program
    .command("story")
    .description(COPY.storyDescription)
    .addHelpCommand(false)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .addHelpText("after", `\n${COPY.storyHelpAfter}`);

  story
    .command("list")
    .description(COPY.storyListDescription)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
    .option("-s, --status <status>", "按状态筛选，例如 planning")
    .option("-i, --iteration-id <id>", "按迭代 ID 筛选")
    .option("-l, --label <label>", "按标签筛选")
    .option("--all", "直接加载全部，跳过交互分类选择")
    .option("--limit <number>", "返回数量，默认 100", "100")
    .addHelpText("after", `\n${COPY.storyListHelpAfter}`)
    .action(async (options: StoryListOptions) => {
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
          message: COPY.storySelectCategoryMessage,
          default: "all",
          choices: [
            { name: COPY.storyCategoryAll, value: "all" },
            { name: COPY.storyCategoryStatus, value: "status" },
            { name: COPY.storyCategoryIteration, value: "iteration" },
            { name: COPY.storyCategoryLabel, value: "label" }
          ]
        });
        if (category === "status") {
          status = await select({
            message: COPY.storySelectStatusMessage,
            choices: [
              { name: `${COPY.storyStatusPlanningOption} planning`, value: "planning" },
              { name: `${COPY.storyStatusDevelopingOption} developing`, value: "developing" },
              { name: `${COPY.storyStatusResolvedOption} resolved`, value: "resolved" },
              { name: `${COPY.storyStatusRejectedOption} rejected`, value: "rejected" },
              { name: COPY.storyStatusCustomOption, value: "__custom__" }
            ]
          });
          if (status === "__custom__") status = await input({ message: COPY.storyInputStatusMessage, required: true });
        } else if (category === "iteration") {
          const iterations = selectableIterations(await client.listIterations(token, workspaceId));
          if (iterations.length === 0) throw new Error("当前空间没有可选的进行中迭代");
          iterationId = await select({
            message: COPY.storySelectIterationMessage,
            choices: iterations.map((item) => ({
              name: `${item.name} (${item.id}) ${iterationStatusLabel(item.status)}`.trim(),
              value: item.id
            }))
          });
        } else if (category === "label") {
          label = await input({ message: COPY.storyInputLabelMessage, required: true });
        }
      }

      const limit = Number.parseInt(options.limit ?? "100", 10);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error("--limit 必须是正整数");

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
      renderStoryList(stories);
    });

  story
    .command("tasks")
    .argument("<markdown-file-or-story-id>", "Markdown 文件或 TAPD 需求 ID")
    .description(COPY.storyTasksDescription)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
    .option("-s, --status <status>", "按任务状态筛选：open/progressing/done")
    .option("-o, --owner <owner>", "按处理人筛选")
    .option("--all", "拉取全部任务")
    .option("--limit <number>", "返回数量，默认 50", "50")
    .addHelpText("after", `\n${COPY.storyTasksHelpAfter}`)
    .action(async (value: string, options: StoryTasksOptions) => {
      const resolved = await resolveStoryTarget(value);
      const workspace = await resolveWorkspaceContext(process.cwd(), resolved.workspaceId ?? options.workspaceId);
      workspaceBanner(workspace);
      const workspaceId = workspace.id;
      const client = new TapdClient();
      const token = await getToken(client);

      const limit = Number.parseInt(options.limit ?? "50", 10);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error("--limit 必须是正整数");

      const spinner = ora("查询需求任务").start();
      const [storyData, taskResult] = await withSpinner(
        spinner,
        async () => Promise.all([
          client.getStory(token, workspaceId, resolved.storyId),
          loadTasks(client, token, {
            workspaceId,
            storyId: resolved.storyId,
            status: options.status,
            owner: options.owner,
            limit,
            all: options.all
          })
        ]),
        { successText: "查询完成", failText: "查询需求任务失败" }
      );

      info(`${storyData.name} (${storyData.id})`);
      success(`任务总数 ${taskResult.total}，当前展示 ${taskResult.tasks.length}`);
      if (taskResult.tasks.length === 0) {
        info("暂无任务");
        return;
      }
      info(formatTaskSummary(taskResult.tasks));
      renderTaskList(taskResult.tasks);
      if (!options.all && taskResult.total > taskResult.tasks.length) {
        info(`还有 ${taskResult.total - taskResult.tasks.length} 条未展示，可使用 --all 或调大 --limit`);
      }
    });

  story
    .command("create")
    .argument("<markdown-file>", "本地 Markdown 文件")
    .description(COPY.storyCreateDescription)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
    .addHelpText("after", `\n${COPY.storyCreateHelpAfter}`)
    .action(async (file: string, options: { workspaceId?: string }) => {
      const doc = await readMarkdown(file);
      const workspace = await resolveWorkspaceContext(process.cwd(), doc.frontmatter.workspace_id ?? options.workspaceId);
      workspaceBanner(workspace);
      const workspaceId = workspace.id;
      const client = new TapdClient();
      const token = await getToken(client);

      // 获取配置中的默认创建人
      const config = await loadConfig();
      const defaultCreator = config.defaultCreator;

      const iterationId = doc.frontmatter.iteration_id ?? await chooseIteration(client, token, workspaceId);
      const creator = doc.frontmatter.creator ?? defaultCreator ?? await chooseCreator(client, token, workspaceId);

      const spinner = ora("创建 TAPD 需求").start();
      const created = await withSpinner(
        spinner,
        () => createStoryFromMarkdown(file, doc, client, token, workspaceId, iterationId, creator, spinner),
        { successText: "需求创建成功", failText: "创建 TAPD 需求失败" }
      );
      success(`${created.name} (${created.id})`);
    });

  story
    .command("update")
    .argument("<markdown-file>", "本地 Markdown 文件")
    .description(COPY.storyUpdateDescription)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .option("-w, --workspace-id <id>", "覆盖 workspace_id")
    .addHelpText("after", `\n${COPY.storyUpdateHelpAfter}`)
    .action(async (file: string, options: { workspaceId?: string }) => {
      const doc = await readMarkdown(file);
      if (!doc.frontmatter.tapd_id) throw new Error("Markdown frontmatter 缺少 tapd_id，无法更新");
      const tapdId = doc.frontmatter.tapd_id;
      const workspace = await resolveWorkspaceContext(process.cwd(), doc.frontmatter.workspace_id ?? options.workspaceId);
      workspaceBanner(workspace);
      const workspaceId = workspace.id;
      const client = new TapdClient();
      const token = await getToken(client);
      const spinner = ora("更新 TAPD 需求").start();
      const updated = await withSpinner(
        spinner,
        async () => {
          if (hasUploadableLocalResources(doc.content)) spinner.text = "上传本地图片资源并更新需求";
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
          } catch (error) {
            if (!isStoryNotFoundError(error, tapdId)) throw error;
            spinner.text = "TAPD 需求不存在，重新创建需求";
            return await createStoryFromMarkdown(
              file,
              doc,
              client,
              token,
              workspaceId,
              doc.frontmatter.iteration_id,
              doc.frontmatter.creator,
              spinner
            );
          }
        },
        { successText: "需求更新成功", failText: "更新 TAPD 需求失败" }
      );
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
    .description(COPY.storyGetDescription)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
    .addHelpText("after", `\n${COPY.storyGetHelpAfter}`)
    .action(async (storyId: string, options: { workspaceId?: string }) => {
      const workspace = await resolveWorkspaceContext(process.cwd(), options.workspaceId);
      workspaceBanner(workspace);
      const workspaceId = workspace.id;
      const client = new TapdClient();
      const token = await getToken(client);
      const [storyData, storyStatusMap] = await Promise.all([
        client.getStory(token, workspaceId, storyId),
        client.getStoryStatusMap(token, workspaceId)
      ]);
      info(`${storyData.name} (${storyData.id})`);
      info(
        `状态：${storyStatusLabel(storyData.status, storyStatusMap)}  迭代：${storyData.iteration_id || "-"}  标签：${storyData.label || "-"}  更新时间：${storyData.modified || "-"}`
      );
      info(truncate(storyData.description, 300));
    });

  story
    .command("pull")
    .argument("<story-id>", "TAPD 需求 ID")
    .argument("[output-file]", "输出 Markdown 文件路径，默认为 <story-id>.md")
    .description(COPY.storyPullDescription)
    .addHelpText("before", () => `${currentWorkspaceHelpText()}\n`)
    .option("-w, --workspace-id <id>", "覆盖默认 workspace_id")
    .addHelpText("after", `\n${COPY.storyPullHelpAfter}`)
    .action(async (storyId: string, outputFile: string | undefined, options: { workspaceId?: string }) => {
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
      const images: Array<{ alt: string; url: string; match: string }> = [];
      let match: RegExpExecArray | null;
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
        await withSpinner(
          spinner,
          async () => {
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
              } catch (error) {
                spinner.warn(`图片下载失败: ${image.url} - ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          },
          { successText: `已下载 ${images.length} 张图片到 ${assetsDir}`, failText: "下载需求图片失败" }
        );
      }

      const frontmatter: StoryFrontmatter = {
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
