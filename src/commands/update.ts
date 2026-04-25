import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Command } from "commander";
import { COPY } from "../command-text.js";
import { info, success } from "../ui.js";

const execFileAsync = promisify(execFile);

function npmBin(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

type UpdateOptions = {
  packageName: string;
  currentVersion: string;
};

export function registerUpdate(program: Command, options: UpdateOptions): void {
  program
    .command("update")
    .description(COPY.updateDescription)
    .addHelpCommand(false)
    .addHelpText("after", `\n${COPY.updateHelpAfter}`)
    .action(async () => {
      info(`当前版本：${options.currentVersion}`);

      const { stdout } = await execFileAsync(npmBin(), ["view", options.packageName, "version"], {
        encoding: "utf8"
      });
      const latestVersion = stdout.trim();
      if (!latestVersion) {
        throw new Error("无法获取 npm 最新版本");
      }

      info(`最新版本：${latestVersion}`);
      if (latestVersion === options.currentVersion) {
        success("当前已经是最新版本");
        return;
      }

      info(`开始更新 ${options.packageName}@latest`);
      await execFileAsync(npmBin(), ["install", "-g", `${options.packageName}@latest`], {
        encoding: "utf8"
      });
      success(`更新完成：${options.currentVersion} -> ${latestVersion}`);
    });
}
