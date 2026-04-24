import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { convertLocalImageReferences, hasLocalImageReferences, stripLocalDocumentLinks } from "../src/local-assets.js";

describe("local assets", () => {
  it("uploads local images and replaces references with placeholders", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tapd-assets-"));
    try {
      const image = path.join(dir, "diagram.png");
      const markdownFile = path.join(dir, "story.md");
      await writeFile(image, new Uint8Array([137, 80, 78, 71]), "utf8");
      await writeFile(markdownFile, "unused", "utf8");
      const uploadImageBase64 = vi.fn(async () => ({ id: "attachment-1", content_type: "image/png" }));

      const result = await convertLocalImageReferences("![流程图](./diagram.png)\n\n[详情](./detail.md)", {
        client: { uploadImageBase64 } as never,
        token: "token",
        workspaceId: "workspace",
        storyId: "story",
        markdownFile,
        owner: "owner"
      });

      expect(result.images).toHaveLength(1);
      expect(result.templateContent).toContain("@@TAPD_LOCAL_IMAGE_1@@");
      expect(result.templateContent).toContain("[详情](./detail.md)");
      expect(uploadImageBase64).toHaveBeenCalledWith("token", {
        workspaceId: "workspace",
        entryId: "story",
        base64Data: "iVBORw==",
        owner: "owner"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not treat local markdown or html links as uploadable images", () => {
    expect(hasLocalImageReferences("[A](./a.md)\n[B](./b.html)")).toBe(false);
    expect(hasLocalImageReferences("![A](./a.png)")).toBe(true);
  });

  it("strips local markdown and html link targets before submission", () => {
    const markdown = [
      "[Local MD](./a.md)",
      "[Local HTML](/tmp/a.html)",
      "[Remote](https://example.com/a.md)",
      "![Image](./a.png)"
    ].join("\n");

    const stripped = stripLocalDocumentLinks(markdown);

    expect(stripped).toContain("Local MD");
    expect(stripped).toContain("Local HTML");
    expect(stripped).not.toContain("./a.md");
    expect(stripped).not.toContain("/tmp/a.html");
    expect(stripped).toContain("[Remote](https://example.com/a.md)");
    expect(stripped).toContain("![Image](./a.png)");
  });
});
