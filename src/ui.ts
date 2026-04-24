import chalk from "chalk";

export function brand(): string {
  return `${chalk.cyan.bold("tapd")} ${chalk.gray("markdown cli")}`;
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
  console.log(`${chalk.green("✓")} 默认空间： ${chalk.bold(name)} ${chalk.gray(`(${workspace.id})`)}`);
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

export function truncate(value: string | undefined, max = 120): string {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}
