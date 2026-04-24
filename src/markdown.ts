import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";
import { marked } from "marked";
import TurndownService from "turndown";
import type { StoryFrontmatter } from "./types.js";

export type MarkdownDocument = {
  path: string;
  frontmatter: StoryFrontmatter;
  content: string;
  html: string;
};

marked.setOptions({
  gfm: true,
  breaks: false
});

export async function readMarkdown(filePath: string): Promise<MarkdownDocument> {
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);
  const html = await marked.parse(parsed.content);
  return {
    path: filePath,
    frontmatter: parsed.data as StoryFrontmatter,
    content: parsed.content,
    html: String(html).trim()
  };
}

export async function writeFrontmatter(filePath: string, updates: StoryFrontmatter): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);
  const nextData = Object.fromEntries(
    Object.entries({ ...parsed.data, ...updates }).filter(([, value]) => value !== undefined)
  );
  await writeFile(filePath, matter.stringify(parsed.content, nextData), "utf8");
}

export async function markdownToHtml(markdown: string): Promise<string> {
  return String(await marked.parse(markdown)).trim();
}

export async function documentToHtml(doc: Pick<MarkdownDocument, "content">, content = doc.content): Promise<string> {
  return markdownToHtml(content);
}

export function titleFromDocument(doc: MarkdownDocument): string {
  if (doc.frontmatter.title?.trim()) return doc.frontmatter.title.trim();
  const heading = doc.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  throw new Error("Markdown 缺少需求标题：请在 frontmatter.title 或一级标题中提供标题");
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

export async function writeMarkdown(filePath: string, frontmatter: StoryFrontmatter, content: string): Promise<void> {
  const data = Object.fromEntries(
    Object.entries(frontmatter).filter(([, value]) => value !== undefined)
  );
  await writeFile(filePath, matter.stringify(content, data), "utf8");
}
