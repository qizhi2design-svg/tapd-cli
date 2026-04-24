import chalk from "chalk";
import { resolveWorkspaceContextSync } from "./config.js";
import { COPY } from "./command-text.js";
export function brand() {
    return `${chalk.cyan.bold("tapd")} ${chalk.gray(COPY.brandSubtitle)}`;
}
export function success(message) {
    console.log(`${chalk.green("✓")} ${message}`);
}
export function warn(message) {
    console.warn(`${chalk.yellow("!")} ${message}`);
}
export function info(message) {
    console.log(`${chalk.cyan("i")} ${message}`);
}
export function workspaceBanner(workspace) {
    const name = workspace.name ?? "未知空间";
    console.log(`${chalk.green("✓")} 当前空间： ${chalk.bold(name)} ${chalk.gray(`(${workspace.id})`)}`);
}
export function fail(message) {
    console.error(`${chalk.red("✖")} ${message}`);
}
export function maskSecret(value) {
    if (value.length <= 10)
        return "********";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
export function table(rows) {
    if (rows.length === 0) {
        info("暂无数据");
        return;
    }
    console.table(rows);
}
export function compactList(rows) {
    if (rows.length === 0) {
        info("暂无数据");
        return;
    }
    for (const [index, row] of rows.entries()) {
        console.log(row.title);
        for (const line of row.lines ?? []) {
            console.log(`   ${chalk.gray(line)}`);
        }
    }
}
export function truncate(value, max = 120) {
    if (!value)
        return "";
    const compact = value.replace(/\s+/g, " ").trim();
    return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}
export async function withSpinner(spinner, task, options = {}) {
    try {
        const result = await task();
        if (options.stopOnSuccess) {
            spinner.stop();
        }
        else if (options.successText) {
            spinner.succeed(options.successText);
        }
        return result;
    }
    catch (error) {
        if (spinner.isSpinning) {
            if (options.failText) {
                spinner.fail(options.failText);
            }
            else {
                spinner.stop();
            }
        }
        throw error;
    }
}
export function currentWorkspaceHelpText(cwd = process.cwd()) {
    const workspace = resolveWorkspaceContextSync(cwd);
    if (!workspace.id) {
        return `${chalk.cyan.bold("当前空间")} ${chalk.gray("未设置")}`;
    }
    return `${chalk.cyan.bold("当前空间")} ${chalk.bold(workspace.name ?? "未知空间")} ${chalk.gray(`(${workspace.id})`)}`;
}
//# sourceMappingURL=ui.js.map