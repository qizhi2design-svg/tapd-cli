import chalk from "chalk";
import type { Ora } from "ora";
import { resolveWorkspaceContextSync } from "./config.js";
import { COPY } from "./command-text.js";

export function brand(): string {
  return `${chalk.cyan.bold("tapd")} ${chalk.gray(COPY.brandSubtitle)}`;
}

export function success(message: string): void {
  console.log(`${chalk.green("✓")} ${message}`);
}

export function warn(message: string): void {
  console.warn(`${chalk.yellow("!")} ${message}`);
}

export function info(message: string): void {
  console.log(`${chalk.cyan("i")} ${message}`);
}

export function workspaceBanner(workspace: { id: string; name?: string }): void {
  const name = workspace.name ?? "未知空间";
  console.log(`${chalk.green("✓")} 当前空间： ${chalk.bold(name)} ${chalk.gray(`(${workspace.id})`)}`);
}

export function fail(message: string): void {
  console.error(`${chalk.red("✖")} ${message}`);
}

export function maskSecret(value: string): string {
  if (value.length <= 10) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function table(rows: Array<Record<string, string | undefined>>): void {
  if (rows.length === 0) {
    info("暂无数据");
    return;
  }
  console.table(rows);
}

export function compactList(
  rows: Array<{
    title: string;
    lines?: string[];
  }>
): void {
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

export function truncate(value: string | undefined, max = 120): string {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

export async function withSpinner<T>(
  spinner: Ora,
  task: () => Promise<T>,
  options: { successText?: string; failText?: string; stopOnSuccess?: boolean } = {}
): Promise<T> {
  try {
    const result = await task();
    if (options.stopOnSuccess) {
      spinner.stop();
    } else if (options.successText) {
      spinner.succeed(options.successText);
    }
    return result;
  } catch (error) {
    if (spinner.isSpinning) {
      if (options.failText) {
        spinner.fail(options.failText);
      } else {
        spinner.stop();
      }
    }
    throw error;
  }
}

export function currentWorkspaceHelpText(cwd = process.cwd()): string {
  const workspace = resolveWorkspaceContextSync(cwd);
  if (!workspace.id) {
    return `${chalk.cyan.bold("当前空间")} ${chalk.gray("未设置")}`;
  }
  return `${chalk.cyan.bold("当前空间")} ${chalk.bold(workspace.name ?? "未知空间")} ${chalk.gray(`(${workspace.id})`)}`;
}
