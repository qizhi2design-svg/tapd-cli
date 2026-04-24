# TAPD Markdown CLI

用本地 Markdown 管理 TAPD 需求、更新需求和评论。

## 安装

```bash
pnpm --dir cli install
pnpm --dir cli lint
pnpm --dir cli build
npm install -g ./cli
```

也可以使用：

```bash
pnpm add -g ./cli
npm link ./cli
```

安装后命令为：

```bash
tapd -h
```

## 本地调试

不需要先全局安装，可以直接用源码调试：

```bash
pnpm --dir cli tapd -h
pnpm --dir cli tapd story create ./需求.md
pnpm --dir cli tapd comment list 1147232921001000017 --workspace-id 47232921
```

统一检查：

```bash
pnpm --dir cli lint
```

构建后运行：

```bash
pnpm --dir cli build
pnpm --dir cli start -h
```

## 开发软连接

如果希望在任意目录直接运行 `tapd`，可以把当前 CLI 包软连接到 pnpm 全局命令目录：

```bash
pnpm --dir cli link:global
tapd -h
```

等价手动命令：

```bash
pnpm --dir cli build
cd cli
pnpm link --global
```

当前机器的 pnpm 全局 bin 目录可通过下面命令查看：

```bash
pnpm bin -g
```

如果 `tapd` 提示找不到命令，确认该目录已加入 `PATH`。

移除软连接：

```bash
pnpm --dir cli unlink:global
```

## 初始化

```bash
tapd auth bind
tapd init
```

配置文件写入当前项目：

- `.tapd/config.json`：`company_id`、默认 `workspace_id`
- `.tapd/credentials.json`：应用 ID 和密钥

`.tapd/credentials.json` 已被 `.gitignore` 忽略。

### 认证方式

支持两种认证方式。

开放应用凭证：

```bash
tapd auth bind --mode app
tapd auth bind --mode app --client-id tapd-app-xxx --client-secret xxx --company-id 41988264
```

个人令牌：

```bash
tapd auth bind --mode personal
tapd auth bind --mode personal --personal-token xxx --workspace-id 58491787
```

个人令牌模式会使用 `workspace_id` 做只读验证，并自动反查 `company_id` 和默认空间。

## Markdown 示例

```markdown
---
title: "需求标题"
label: "local-md|cli"
status: "planning"
---

# 需求背景

这里写需求正文。

## 验收标准

- 支持创建 TAPD 需求
- 支持更新 TAPD 需求
```

正文会转换为 HTML 后写入 TAPD `description`。

## 常用命令

```bash
tapd workspace list
tapd workspace add --workspace-id 58491787
tapd workspace use
tapd workspace use --workspace-id 58491787

tapd story list
tapd story list --all
tapd story list --status planning
tapd story list --iteration-id 1147232921001000005

tapd story create ./需求.md
tapd story update ./需求.md
tapd story get 1147232921001000017

tapd comment add ./需求.md --message "已完成评审"
tapd comment add 1147232921001000017 --file ./comment.md
tapd comment list ./需求.md
```
