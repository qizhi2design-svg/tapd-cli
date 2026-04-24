import { readFile } from "node:fs/promises";
import path from "node:path";
const markdownImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const markdownLinkPattern = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp"]);
const localDocumentExtensions = new Set([".md", ".markdown", ".html", ".htm"]);
export function hasLocalImageReferences(markdown) {
    return findLocalImageReferences(markdown).length > 0;
}
export function stripLocalDocumentLinks(markdown) {
    return markdown.replace(markdownLinkPattern, (raw, label, href) => {
        if (!isLocalPath(href) || !isLocalDocumentReference(href))
            return raw;
        return label;
    });
}
export async function convertLocalImageReferences(markdown, options) {
    const matches = findLocalImageReferences(markdown);
    if (matches.length === 0)
        return { content: markdown, templateContent: markdown, images: [] };
    const images = [];
    let templateContent = "";
    let lastIndex = 0;
    for (const match of matches) {
        const index = images.length + 1;
        const placeholder = `@@TAPD_LOCAL_IMAGE_${index}@@`;
        const sourcePath = resolveLocalReference(options.markdownFile, decodeURI(match.href));
        const extension = path.extname(sourcePath).toLowerCase();
        if (!supportedImageExtensions.has(extension)) {
            throw new Error(`不支持的本地图片格式：${sourcePath}`);
        }
        const bytes = await readFile(sourcePath);
        const base64 = bytes.toString("base64");
        const attachment = await options.client.uploadImageBase64(options.token, {
            workspaceId: options.workspaceId,
            entryId: options.storyId,
            base64Data: base64,
            owner: options.owner
        });
        images.push({ index, placeholder, base64, alt: match.alt, sourcePath, attachment });
        templateContent += markdown.slice(lastIndex, match.index);
        templateContent += placeholder;
        lastIndex = match.index + match.raw.length;
    }
    templateContent += markdown.slice(lastIndex);
    return {
        content: renderLocalImageTemplate(templateContent, images, (image) => imageDataUri(image.base64, image.sourcePath)),
        templateContent,
        images
    };
}
export function renderLocalImageTemplate(templateContent, images, imageSrc) {
    let content = templateContent;
    for (const image of images) {
        const src = imageSrc(image);
        const replacement = src
            ? `<p><img src="${src}" alt="${escapeHtmlAttribute(image.alt)}" style="max-width:100%;" /></p>`
            : `<p>${escapeHtml(image.alt || path.basename(image.sourcePath))}</p>`;
        content = content.split(image.placeholder).join(replacement);
    }
    return content;
}
export function imageDataUri(base64, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const contentType = extension === ".jpg" ? "image/jpeg" : `image/${extension.slice(1)}`;
    return `data:${contentType};base64,${base64}`;
}
function findLocalImageReferences(markdown) {
    return [...markdown.matchAll(markdownImagePattern)]
        .map((match) => ({
        raw: match[0],
        index: match.index ?? 0,
        alt: match[1] ?? "",
        href: match[2] ?? ""
    }))
        .filter((match) => Boolean(match.href) && isLocalPath(match.href) && isSupportedImageReference(match.href));
}
function isLocalPath(href) {
    return !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#") && !href.startsWith("//");
}
function isSupportedImageReference(href) {
    const cleanHref = href.split(/[?#]/, 1)[0] ?? href;
    return supportedImageExtensions.has(path.extname(cleanHref).toLowerCase());
}
function isLocalDocumentReference(href) {
    const cleanHref = href.split(/[?#]/, 1)[0] ?? href;
    return localDocumentExtensions.has(path.extname(cleanHref).toLowerCase());
}
function resolveLocalReference(markdownFile, href) {
    if (path.isAbsolute(href))
        return href;
    return path.resolve(path.dirname(markdownFile), href);
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
//# sourceMappingURL=local-assets.js.map