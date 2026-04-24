import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";
import { marked } from "marked";
marked.setOptions({
    gfm: true,
    breaks: false
});
export async function readMarkdown(filePath) {
    const raw = await readFile(filePath, "utf8");
    const parsed = matter(raw);
    const html = await marked.parse(parsed.content);
    return {
        path: filePath,
        frontmatter: parsed.data,
        content: parsed.content,
        html: String(html).trim()
    };
}
export async function writeFrontmatter(filePath, updates) {
    const raw = await readFile(filePath, "utf8");
    const parsed = matter(raw);
    const nextData = Object.fromEntries(Object.entries({ ...parsed.data, ...updates }).filter(([, value]) => value !== undefined));
    await writeFile(filePath, matter.stringify(parsed.content, nextData), "utf8");
}
export async function markdownToHtml(markdown) {
    return String(await marked.parse(markdown)).trim();
}
export async function documentToHtml(doc, content = doc.content) {
    return markdownToHtml(content);
}
export function titleFromDocument(doc) {
    if (doc.frontmatter.title?.trim())
        return doc.frontmatter.title.trim();
    const heading = doc.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading)
        return heading;
    throw new Error("Markdown 缺少需求标题：请在 frontmatter.title 或一级标题中提供标题");
}
//# sourceMappingURL=markdown.js.map