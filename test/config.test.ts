import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadConfig,
  loadCredentials,
  saveConfig,
  saveGlobalConfig,
  saveGlobalCredentials
} from "../src/config.js";

describe("config", () => {
  it("saves project config in project .tapd directory", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "tapd-home-"));
    const dir = await mkdtemp(path.join(os.tmpdir(), "tapd-config-"));
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    await saveConfig({ companyId: "41988264", defaultWorkspaceId: "47232921" }, dir);
    await expect(loadConfig(dir)).resolves.toEqual({ companyId: "41988264", defaultWorkspaceId: "47232921" });

    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    await rm(home, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  });

  it("falls back to global config and credentials when project .tapd is missing", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "tapd-home-"));
    const project = await mkdtemp(path.join(os.tmpdir(), "tapd-project-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    await saveGlobalConfig({ companyId: "20017821", defaultWorkspaceId: "51611517" });
    await saveGlobalCredentials({ mode: "personal", personalToken: "token" });

    await expect(loadConfig(project)).resolves.toEqual({
      companyId: "20017821",
      defaultWorkspaceId: "51611517"
    });
    await expect(loadCredentials(project)).resolves.toEqual({ mode: "personal", personalToken: "token" });

    await rm(home, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  it("merges project config over global config", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "tapd-home-"));
    const project = await mkdtemp(path.join(os.tmpdir(), "tapd-project-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    await saveGlobalConfig({
      companyId: "20017821",
      defaultWorkspaceId: "51611517",
      defaultWorkspaceName: "AI客服"
    });
    await saveConfig({
      defaultWorkspaceId: "58491787",
      defaultWorkspaceName: "海外产品组",
      defaultCreator: "黄启智"
    }, project);

    await expect(loadConfig(project)).resolves.toEqual({
      companyId: "20017821",
      defaultWorkspaceId: "58491787",
      defaultWorkspaceName: "海外产品组",
      defaultCreator: "黄启智"
    });

    await rm(home, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });
});
