import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TapdClient } from "./api.js";
import type { Attachment } from "./types.js";

export type LocalImage = {
  index: number;
  placeholder: string;
  base64: string;
  alt: string;
  sourcePath: string;
  attachment?: Attachment;
};

export type LocalImageConversionResult = {
  content: string;
  templateContent: string;
  images: LocalImage[];
};

export type ConvertLocalImageReferencesOptions = {
  client: TapdClient;
  token: string;
  workspaceId: string;
  storyId: string;
  markdownFile: string;
  owner?: string;
};

const markdownImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const markdownLinkPattern = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp"]);
const localDocumentExtensions = new Set([".md", ".markdown", ".html", ".htm"]);

export function hasLocalImageReferences(markdown: string): boolean {
  return findLocalImageReferences(markdown).length > 0;
}

export function stripLocalDocumentLinks(markdown: string): string {
  return markdown.replace(markdownLinkPattern, (raw, label: string, href: string) => {
    if (!isLocalPath(href) || !isLocalDocumentReference(href)) return raw;
    return label;
  });
}

export async function convertLocalImageReferences(
  markdown: string,
  options: ConvertLocalImageReferencesOptions
): Promise<LocalImageConversionResult> {
  const matches = findLocalImageReferences(markdown);
  if (matches.length === 0) return { content: markdown, templateContent: markdown, images: [] };

  const images: LocalImage[] = [];
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

export function renderLocalImageTemplate(
  templateContent: string,
  images: LocalImage[],
  imageSrc: (image: LocalImage) => string | undefined
): string {
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

export function imageDataUri(base64: string, filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = extension === ".jpg" ? "image/jpeg" : `image/${extension.slice(1)}`;
  return `data:${contentType};base64,${base64}`;
}

type LocalImageMatch = {
  raw: string;
  index: number;
  alt: string;
  href: string;
};

function findLocalImageReferences(markdown: string): LocalImageMatch[] {
  return [...markdown.matchAll(markdownImagePattern)]
    .map((match) => ({
      raw: match[0],
      index: match.index ?? 0,
      alt: match[1] ?? "",
      href: match[2] ?? ""
    }))
    .filter((match) => Boolean(match.href) && isLocalPath(match.href) && isSupportedImageReference(match.href));
}

function isLocalPath(href: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#") && !href.startsWith("//");
}

function isSupportedImageReference(href: string): boolean {
  const cleanHref = href.split(/[?#]/, 1)[0] ?? href;
  return supportedImageExtensions.has(path.extname(cleanHref).toLowerCase());
}

function isLocalDocumentReference(href: string): boolean {
  const cleanHref = href.split(/[?#]/, 1)[0] ?? href;
  return localDocumentExtensions.has(path.extname(cleanHref).toLowerCase());
}

function resolveLocalReference(markdownFile: string, href: string): string {
  if (path.isAbsolute(href)) return href;
  return path.resolve(path.dirname(markdownFile), href);
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
