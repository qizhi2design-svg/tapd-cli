import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, loadCredentials, saveConfig, saveCredentials } from "../src/config.js";

describe("config", () => {
  it("saves config and credentials in project .tapd directory", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tapd-config-"));
    await saveConfig({ companyId: "41988264", defaultWorkspaceId: "47232921" }, dir);
    await saveCredentials({ mode: "app", clientId: "app", clientSecret: "secret" }, dir);
    await expect(loadConfig(dir)).resolves.toEqual({ companyId: "41988264", defaultWorkspaceId: "47232921" });
    await expect(loadCredentials(dir)).resolves.toEqual({ mode: "app", clientId: "app", clientSecret: "secret" });
    await rm(dir, { recursive: true, force: true });
  });

  it("saves personal token credentials", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tapd-config-"));
    await saveCredentials({ mode: "personal", personalToken: "token" }, dir);
    await expect(loadCredentials(dir)).resolves.toEqual({ mode: "personal", personalToken: "token" });
    await rm(dir, { recursive: true, force: true });
  });
});
