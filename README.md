# @huangqz/tapd-cli

通过本地 Markdown 文件管理 TAPD 需求的命令行工具。

## 安装

```bash
npm install -g @huangqz/tapd-cli
```

## 快速开始

### 1. 认证

```bash
# 使用个人令牌认证
tapd login --mode personal --token YOUR_TOKEN --workspace-id YOUR_WORKSPACE_ID

# 或使用开放应用凭证认证
tapd login --mode app --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

### 2. 初始化项目

```bash
tapd init
```

### 3. 创建需求

创建一个 Markdown 文件，例如 `需求.md`：

```markdown
---
workspace_id: '58491787'
iteration_id: '1158491787001000001'
---

# 需求标题

需求描述内容...

## 功能点

- 功能 1
- 功能 2
```

然后执行：

```bash
tapd story create ./需求.md
```

### 4. 更新需求

修改 Markdown 文件后：

```bash
tapd story update ./需求.md
```

## 主要功能

- ✅ 支持 Markdown 格式编写需求
- ✅ 自动转换 Markdown 为 TAPD HTML 格式
- ✅ 支持 Mermaid 图表（自动渲染为图片）
- ✅ 支持本地图片上传
- ✅ 双向同步：从 TAPD 拉取需求到本地
- ✅ 查看需求下的排期任务
- ✅ 查看迭代信息和迭代任务情况
- ✅ 评论管理

## 命令列表

### 认证相关

- `tapd login` - 登录 TAPD 并保存本地凭证
- `tapd logout` - 清除本地认证文件

### 工作空间

- `tapd init` - 初始化项目配置
- `tapd workspace list` - 列出所有工作空间
- `tapd workspace use` - 切换默认工作空间

### 迭代

- `tapd iteration list` - 查看当前空间迭代列表
- `tapd iteration get <iteration-id>` - 查看迭代基础信息
- `tapd iteration tasks <iteration-id>` - 查看迭代下的任务情况

### 需求管理

- `tapd story create <file>` - 从 Markdown 创建需求
- `tapd story update <file>` - 更新需求
- `tapd story get <story-id>` - 获取需求内容摘要
- `tapd story pull <story-id> [output-file]` - 拉取需求到本地 Markdown
- `tapd story list` - 列出需求
- `tapd story tasks <story-id>` - 查看需求下的任务排期

### 评论

- `tapd comment add <file>` - 添加评论
- `tapd comment list <file>` - 查看评论列表

## Markdown Frontmatter 字段

```yaml
---
tapd_id: '1158491787001631079'           # TAPD 需求 ID（更新时必需）
workspace_id: '58491787'                 # 工作空间 ID
iteration_id: '1158491787001000001'      # 迭代 ID
creator: 'username'                       # 创建人
owner: 'username'                         # 处理人
label: 'feature'                          # 标签
status: 'developing'                      # 状态
---
```

## 许可证

MIT

## 问题反馈

https://github.com/qizhi2design-svg/tapd-cli/issues
