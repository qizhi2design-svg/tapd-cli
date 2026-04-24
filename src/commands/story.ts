import { input, select } from "@inquirer/prompts";
import ora from "ora";
import { isStoryNotFoundError, TapdClient } from "../api.js";
import { requireWorkspace, resolveWorkspaceContext } from "../config.js";
import {
  convertLocalImageReferences,
  hasLocalImageReferences,
  imageDataUri as localImageDataUri,
  stripLocalDocumentLinks
} from "../local-assets.js";
import { convertMermaidBlocks, hasMermaidBlocks, imageDataUri as mermaidImageDataUri } from "../mermaid.js";
import { markdownToHtml, readMarkdown, titleFromDocument, writeFrontmatter } from "../markdown.js";
import { getToken } from "../session.js";
import type { Story } from "../types.js";
import { info, success, table, truncate, workspaceBanner } from "../ui.js";

type StoryListOptions = {
  workspaceId?: string;
  status?: string;
  iterationId?: string;
  label?: string;
  all?: boolean;
  limit?: string;
};

async function chooseIteration(client: TapdClient, token: string, workspaceId: string): Promise<string | undefined> {
  const iterations = await client.listIterations(token, workspaceId);
  if (iterations.length === 0) return undefined;
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

async function chooseCreator(client: TapdClient, token: string, workspaceId: string): Promise<string | undefined> {
  const users = await client.listUsers(token, workspaceId);
  if (users.length === 0) return undefined;
  return select({
    message: "选择创建人",
    choices: users.map((item) => ({
      name: `${item.user}${item.name ? ` - ${item.name}` : ""}`,
      value: item.user
    }))
  });
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
          if (status === "__custom__") status = await input({ message: "输入状态值", required: true });
        } else if (category === "iteration") {
          const iterations = await client.listIterations(token, workspaceId);
          iterationId = await select({
            message: "选择迭代",
            choices: iterations.map((item) => ({
              name: `${item.name} (${item.id}) ${item.status ?? ""}`.trim(),
              value: item.id
            }))
          });
        } else if (category === "label") {
          label = await input({ message: "输入标签", required: true });
        }
      }

      const limit = Number.parseInt(options.limit ?? "100", 10);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error("--limit 必须是正整数");

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
    .action(async (file: string, options: { workspaceId?: string }) => {
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
    .action(async (file: string, options: { workspaceId?: string }) => {
      const doc = await readMarkdown(file);
      if (!doc.frontmatter.tapd_id) throw new Error("Markdown frontmatter 缺少 tapd_id，无法更新");
      const workspace = await resolveWorkspaceContext(process.cwd(), doc.frontmatter.workspace_id ?? options.workspaceId);
      workspaceBanner(workspace);
      const workspaceId = workspace.id;
      const client = new TapdClient();
      const token = await getToken(client);
      const spinner = ora("更新 TAPD 需求").start();
      if (hasUploadableLocalResources(doc.content)) spinner.text = "上传本地图片资源并更新需求";
      let updated: Story;
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
      } catch (error) {
        if (!isStoryNotFoundError(error, doc.frontmatter.tapd_id)) throw error;
        spinner.text = "TAPD 需求不存在，重新创建需求";
        updated = await createStoryFromMarkdown(
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
    .action(async (storyId: string, options: { workspaceId?: string }) => {
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
