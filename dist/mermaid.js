const mermaidBlockPattern = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?:\r?\n|$)/gm;
export function hasMermaidBlocks(markdown) {
    mermaidBlockPattern.lastIndex = 0;
    const found = mermaidBlockPattern.test(markdown);
    mermaidBlockPattern.lastIndex = 0;
    return found;
}
export async function convertMermaidBlocks(markdown, options) {
    const matches = [...markdown.matchAll(mermaidBlockPattern)];
    if (matches.length === 0)
        return { content: markdown, templateContent: markdown, images: [] };
    const images = [];
    let templateContent = "";
    let lastIndex = 0;
    for (const match of matches) {
        const matchIndex = match.index ?? 0;
        const diagram = match[1]?.trim();
        if (!diagram) {
            templateContent += markdown.slice(lastIndex, matchIndex);
            templateContent += match[0];
            lastIndex = matchIndex + match[0].length;
            continue;
        }
        const index = images.length + 1;
        const placeholder = `@@TAPD_MERMAID_IMAGE_${index}@@`;
        const base64 = await renderMermaidPngBase64(diagram, options.renderBaseUrl);
        images.push({ index, placeholder, base64 });
        templateContent += markdown.slice(lastIndex, matchIndex);
        templateContent += placeholder;
        lastIndex = matchIndex + match[0].length;
    }
    templateContent += markdown.slice(lastIndex);
    return {
        content: renderMermaidTemplate(templateContent, images, (image) => imageDataUri(image.base64)),
        templateContent,
        images
    };
}
export function renderMermaidTemplate(templateContent, images, imageSrc) {
    let content = templateContent;
    for (const image of images) {
        const src = imageSrc(image);
        const replacement = src
            ? `<p><img src="${src}" alt="Mermaid diagram ${image.index}" style="max-width:100%;" /></p>`
            : `<p>Mermaid diagram ${image.index}</p>`;
        content = content.split(image.placeholder).join(replacement);
    }
    return content;
}
export function imageDataUri(base64) {
    return `data:image/png;base64,${base64}`;
}
export async function renderMermaidPngBase64(diagram, renderBaseUrl = "https://mermaid.ink") {
    const encoded = Buffer.from(diagram, "utf8").toString("base64url");
    const url = `${renderBaseUrl.replace(/\/$/, "")}/img/${encoded}?type=png&bgColor=white`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Mermaid 图片渲染失败：${response.status} ${response.statusText}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0)
        throw new Error("Mermaid 图片渲染失败：返回内容为空");
    return bytes.toString("base64");
}
//# sourceMappingURL=mermaid.js.map