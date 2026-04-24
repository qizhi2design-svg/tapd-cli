export const COPY = {
  brandSubtitle: "cli",
  rootDescription: "管理 TAPD 需求、迭代空间和评论",
  rootHelpAfter: `
常用流程
  1. tapd login
  2. tapd init
  3. tapd update
  4. tapd story create ./需求.md
  5. tapd story update ./需求.md
  6. tapd comment add ./需求.md --message "已评审"
`,
  loginDescription: "登录 TAPD 并保存本地凭证",
  infoDescription: "查看当前授权、默认空间和创建人信息",
  updateDescription: "更新到 npm 上的最新版本",
  infoHelpAfter: `
示例：
  tapd info

说明：
  只读取本地 .tapd/credentials.json 和 .tapd/config.json
  用于查看当前是否已授权、默认空间和默认创建人
`,
  updateHelpAfter: `
示例：
  tapd update

说明：
  会先查询 npm 上的最新版本
  如果当前不是最新版本，则执行 npm install -g @huangqz/tapd-cli@latest
`,
  loginHelpAfter: `
示例：
  tapd login
  tapd login --mode app --client-id tapd-app-xxx --company-id 41988264
  tapd login --mode personal --personal-token *** --workspace-id 58491787

说明：
  凭证保存到 ~/.tapd/credentials.json，账号级配置保存到 ~/.tapd/config.json。
`,
  logoutDescription: "退出登录并清除本地认证文件",
  loginActionDescription: "登录 TAPD 并保存本地凭证",
  loginActionHelpAfter: `
示例：
  tapd login
  tapd login --mode app --client-id tapd-app-xxx --client-secret *** --company-id 41988264
  tapd login --mode personal --personal-token *** --workspace-id 58491787
`,
  loginModeMessage: "选择认证方式",
  loginModeApp: "开放应用凭证",
  loginModePersonal: "个人令牌",
  loginPersonalTokenMessage: "个人令牌",
  loginPersonalTokenRequired: "请输入个人令牌",
  loginWorkspaceIdMessage: "验证用 workspace_id",
  loginClientIdMessage: "应用 ID",
  loginClientSecretMessage: "应用密钥",
  loginClientSecretRequired: "请输入应用密钥",
  loginCompanyIdMessage: "企业 ID company_id",
  commentDescription: "TAPD 需求评论",
  commentHelpAfter: `
示例：
  tapd comment add ./需求.md --message "已评审"
  tapd comment add 1147232921001000017 --file ./comment.md
  tapd comment list ./需求.md
`,
  commentAddDescription: "添加需求评论",
  commentAddHelpAfter: `
示例：
  tapd comment add ./需求.md --message "已完成评审"
  tapd comment add 1147232921001000017 --file ./comment.md --author 黄启智

说明：
  评论内容会从 Markdown 转成 HTML 后写入 TAPD。
`,
  commentListDescription: "查看需求评论",
  commentListHelpAfter: `
示例：
  tapd comment list ./需求.md
  tapd comment list 1147232921001000017 --workspace-id 47232921
`,
  initDescription: "初始化当前项目，选择默认 TAPD 空间",
  initHelpAfter: `
示例：
  tapd init

  说明：
  应用凭证模式会读取 company_id 并拉取空间列表供下拉选择。
  个人令牌模式会验证当前默认 workspace，因为个人令牌通常不能列出企业项目。
`,
  initSelectWorkspaceMessage: "选择默认空间",
  initSelectCreatorMessage: "选择默认创建人",
  initNoDefaultCreator: "不设置默认创建人",
  workspaceDescription: "TAPD 空间管理",
  workspaceHelpAfter: `
示例：
  tapd workspace list
  tapd workspace add --workspace-id 58491787
  tapd workspace use
  tapd workspace use --workspace-id 58491787
`,
  workspaceListDescription: "列出空间；个人令牌模式仅显示当前默认空间",
  workspaceAddDescription: "验证并缓存一个 workspace_id，适合个人令牌模式管理多个空间",
  workspaceUseDescription: "选择默认空间；个人令牌模式可传 --workspace-id 验证切换",
  workspaceUseSelectMessage: "选择默认空间",
  storyDescription: "TAPD 需求管理",
  storyHelpAfter: `
示例：
  tapd story create ./需求.md
  tapd story update ./需求.md
  tapd story get 1147232921001000017
  tapd story pull 1147232921001000017
  tapd story tasks 1147232921001000017

Markdown frontmatter：
  ---
  title: "需求标题"
  iteration_id: "1147232921001000005"
  creator: "黄启智"
  label: "local-md|cli"
  status: "planning"
  ---
`,
  storyListDescription: "查询需求列表，默认加载全部，也可交互选择分类",
  storyListHelpAfter: `
示例：
  tapd story list
  tapd story list --all
  tapd story list --status planning
  tapd story list --iteration-id 1147232921001000005
  tapd story list --label html-richtext

说明：
  不传筛选参数时，会出现分类下拉：全部、状态、迭代、标签。
  默认选“全部”，最多返回 --limit 条。
`,
  storyTasksDescription: "查看需求下的排期任务",
  storyTasksHelpAfter: `
示例：
  tapd story tasks 1147232921001000017
  tapd story tasks ./需求.md
  tapd story tasks 1147232921001000017 --status progressing
  tapd story tasks 1147232921001000017 --all
`,
  storySelectIterationMessage: "选择迭代",
  storySelectCreatorMessage: "选择创建人",
  storyNoIteration: "不关联迭代",
  storySelectCategoryMessage: "选择需求分类",
  storyCategoryAll: "全部需求",
  storyCategoryStatus: "按状态筛选",
  storyCategoryIteration: "按迭代筛选",
  storyCategoryLabel: "按标签筛选",
  storySelectStatusMessage: "选择状态",
  storyStatusPlanningOption: "规划中",
  storyStatusDevelopingOption: "开发中",
  storyStatusResolvedOption: "已实现",
  storyStatusRejectedOption: "已拒绝",
  storyStatusCustomOption: "自定义输入",
  storyInputStatusMessage: "输入状态值",
  storyInputLabelMessage: "输入标签",
  storyCreateDescription: "从 Markdown 创建 TAPD 需求，并写回 tapd_id",
  storyCreateHelpAfter: `
示例：
  tapd story create ./需求.md
  tapd story create ./需求.md --workspace-id 47232921

行为：
  缺少 iteration_id 或 creator 时，会交互式拉取 TAPD 数据并下拉选择。
  创建成功后会写回 tapd_id、workspace_id、created_at。
`,
  storyUpdateDescription: "根据 Markdown frontmatter 更新 TAPD 需求",
  storyUpdateHelpAfter: `
示例：
  tapd story update ./需求.md

要求：
  Markdown frontmatter 必须已有 tapd_id。
`,
  storyGetDescription: "获取需求内容摘要",
  storyGetHelpAfter: `
示例：
  tapd story get 1147232921001000017
  tapd story get 1147232921001000017 --workspace-id 47232921
`,
  storyPullDescription: "拉取指定需求并转换为 Markdown 文件",
  storyPullHelpAfter: `
示例：
  tapd story pull 1147232921001000017
  tapd story pull 1147232921001000017 ./需求.md
  tapd story pull 1147232921001000017 --workspace-id 47232921

说明：
  会自动下载需求中的图片到 <output-file-dir>/assets/ 目录
  并将 Markdown 中的图片链接替换为本地相对路径
`,
  iterationDescription: "TAPD 迭代管理",
  iterationHelpAfter: `
示例：
  tapd iteration list
  tapd iteration get 1151611517001007745
  tapd iteration tasks 1151611517001007745
`,
  iterationListDescription: "查看当前空间的迭代列表",
  iterationGetDescription: "查看迭代下的需求和汇总情况",
  iterationTasksDescription: "查看迭代下的任务情况",
  iterationTasksHelpAfter: `
示例：
  tapd iteration tasks 1151611517001007745
  tapd iteration tasks 1151611517001007745 --status progressing
  tapd iteration tasks 1151611517001007745 --all
`
} as const;
