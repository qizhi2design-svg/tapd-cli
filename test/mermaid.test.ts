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

  it("renders mermaid blocks and converts them to base64 images", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]))));

    const result = await convertMermaidBlocks("# Flow\n\n```mermaid\nflowchart TD\n  A --> B\n```\n", {});

    expect(result.content).not.toContain("```mermaid");
    expect(result.content).toContain("<img src=\"data:image/png;base64,");
    expect(result.images).toHaveLength(1);
    expect(result.images[0].base64).toBe("iVBORw==");
  });

  it("converts multiple mermaid blocks in the same document", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]))));
    const markdown = "```mermaid\nflowchart TD\n  A --> B\n```\n\ntext\n\n```mermaid\nsequenceDiagram\n  A->>B: hello\n```\n";

    expect(hasMermaidBlocks(markdown)).toBe(true);
    const result = await convertMermaidBlocks(markdown, {});

    expect(result.content.match(/<img /g)).toHaveLength(2);
    expect(result.images).toHaveLength(2);
    expect(result.images[0].base64).toBe("iVBORw==");
    expect(result.images[1].base64).toBe("iVBORw==");
  });
});
