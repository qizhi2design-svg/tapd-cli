import { describe, expect, it } from "vitest";
import { isStoryNotFoundError, TapdClient } from "../src/api.js";

describe("TapdClient", () => {
  it("throws readable error for TAPD status errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: 422, info: "company_id is required." }))) as typeof fetch;
    await expect(new TapdClient("https://example.test").listWorkspaces("token", "")).rejects.toThrow("company_id is required");
    globalThis.fetch = originalFetch;
  });

  it("maps listStories response", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        status: 1,
        info: "success",
        data: [{ Story: { id: "1", name: "需求", status: "planning" } }]
      }));
    }) as typeof fetch;

    const stories = await new TapdClient("https://example.test").listStories("token", {
      workspaceId: "47232921",
      status: "planning",
      limit: 20
    });

    expect(stories).toEqual([{ id: "1", name: "需求", status: "planning" }]);
    expect(requestedUrl).toContain("workspace_id=47232921");
    expect(requestedUrl).toContain("status=planning");
    expect(requestedUrl).toContain("limit=20");
    globalThis.fetch = originalFetch;
  });

  it("verifies personal token by workspace info", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      status: 1,
      info: "success",
      data: { Workspace: { id: "58491787", name: "海外产品组", company_id: "20017821" } }
    }))) as typeof fetch;

    const workspace = await new TapdClient("https://example.test").verifyPersonalToken("token", "58491787");

    expect(workspace).toEqual({ id: "58491787", name: "海外产品组", companyId: "20017821" });
    globalThis.fetch = originalFetch;
  });

  it("detects story not found errors without matching unrelated errors", () => {
    expect(isStoryNotFoundError(new Error("未找到需求：123"), "123")).toBe(true);
    expect(isStoryNotFoundError(new Error("未找到需求：123"), "456")).toBe(false);
    expect(isStoryNotFoundError(new Error("TAPD API 错误：no permission"))).toBe(false);
  });
});
