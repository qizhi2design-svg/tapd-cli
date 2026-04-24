import { afterEach, describe, expect, it, vi } from "vitest";
import { convertMermaidBlocks, hasMermaidBlocks } from "../src/mermaid.js";

describe("mermaid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects mermaid code fences", () => {
    expect(hasMermaidBlocks("# Title\n\n```mermaid\nflowchart TD\n  A --> B\n```\n")).toBe(true);
    expect(hasMermaidBlocks("# Title\n\n```js\nconsole.log(1)\n```\n")).toBe(false);
  });

  it("renders and uploads mermaid blocks before replacing them with images", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]))));
    const uploadImageBase64 = vi.fn(async () => ({
      id: "attachment-1",
      filename: "diagram.png",
      content_type: "image/png"
    }));

    const result = await convertMermaidBlocks("# Flow\n\n```mermaid\nflowchart TD\n  A --> B\n```\n", {
      client: { uploadImageBase64 } as never,
      token: "token",
      workspaceId: "workspace",
      storyId: "story",
      owner: "owner"
    });

    expect(result.content).not.toContain("```mermaid");
    expect(result.content).toContain("<img src=\"data:image/png;base64,");
    expect(result.images).toHaveLength(1);
    expect(uploadImageBase64).toHaveBeenCalledWith("token", {
      workspaceId: "workspace",
      entryId: "story",
      base64Data: "iVBORw==",
      owner: "owner"
    });
  });

  it("converts multiple mermaid blocks in the same document", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]))));
    const uploadImageBase64 = vi.fn(async () => ({ id: "attachment", content_type: "image/png" }));
    const markdown = "```mermaid\nflowchart TD\n  A --> B\n```\n\ntext\n\n```mermaid\nsequenceDiagram\n  A->>B: hello\n```\n";

    expect(hasMermaidBlocks(markdown)).toBe(true);
    const result = await convertMermaidBlocks(markdown, {
        client: { uploadImageBase64 } as never,
        token: "token",
        workspaceId: "workspace",
        storyId: "story"
      });

    expect(result.content.match(/<img /g)).toHaveLength(2);
    expect(result.images).toHaveLength(2);
    expect(uploadImageBase64).toHaveBeenCalledTimes(2);
  });
});
