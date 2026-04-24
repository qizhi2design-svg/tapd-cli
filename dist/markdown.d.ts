import type { StoryFrontmatter } from "./types.js";
export type MarkdownDocument = {
    path: string;
    frontmatter: StoryFrontmatter;
    content: string;
    html: string;
};
export declare function readMarkdown(filePath: string): Promise<MarkdownDocument>;
export declare function writeFrontmatter(filePath: string, updates: StoryFrontmatter): Promise<void>;
export declare function markdownToHtml(markdown: string): Promise<string>;
export declare function documentToHtml(doc: Pick<MarkdownDocument, "content">, content?: string): Promise<string>;
export declare function titleFromDocument(doc: MarkdownDocument): string;
