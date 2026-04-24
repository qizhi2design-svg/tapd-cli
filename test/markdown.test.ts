import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { markdownToHtml, readMarkdown, titleFromDocument, writeFrontmatter } from "../src/markdown.js";

describe("markdown", () => {
  it("parses frontmatter and converts markdown to html", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tapd-md-"));
    const file = path.join(dir, "story.md");
    await writeFile(file, "---\ntitle: 测试需求\nlabel: cli\n---\n# Heading\n\n- item\n\n`code`\n", "utf8");
    const doc = await readMarkdown(file);
    expect(doc.frontmatter.title).toBe("测试需求");
    expect(titleFromDocument(doc)).toBe("测试需求");
    expect(doc.html).toContain("<h1>Heading</h1>");
    expect(doc.html).toContain("<li>item</li>");
    await rm(dir, { recursive: true, force: true });
  });

  it("writes frontmatter without losing body", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tapd-md-"));
    const file = path.join(dir, "story.md");
    await writeFile(file, "---\ntitle: 测试需求\n---\n正文内容\n", "utf8");
    await writeFrontmatter(file, { tapd_id: "123", workspace_id: "456" });
    const raw = await readFile(file, "utf8");
    expect(raw).toContain("tapd_id: '123'");
    expect(raw).toContain("workspace_id: '456'");
    expect(raw).toContain("正文内容");
    await rm(dir, { recursive: true, force: true });
  });

  it("converts links and code fences", async () => {
    const html = await markdownToHtml("[TAPD](https://open.tapd.cn/)\n\n```js\nconsole.log(1)\n```");
    expect(html).toContain("<a href=\"https://open.tapd.cn/\">TAPD</a>");
    expect(html).toContain("<code class=\"language-js\">");
  });
});
