# Daily Log

一个简洁的日志管理应用，用于记录日常笔记和待办事项。

## 功能特性

- **日志记录** - 添加、编辑、删除日志条目
- **待办事项** - 支持 Todo 任务管理，可标记完成状态
- **标签系统** - 快速标签功能，支持分类管理
- **日历视图** - 按日期筛选查看日志
- **AI 总结** - 配置多个 OpenAI 兼容提供商，每天 00:30 自动总结前一天，也可手动生成任意一天；结果作为带 `#AI总结` 标签的日志插入当天 23:59
- **Memos 集成** - 支持将日志同步到 Memos 服务
- **用户认证** - 基于 NextAuth 的登录系统
- **管理后台** - 用户管理（仅管理员）

## 技术栈

- **前端**: Next.js 14, React 18, Tailwind CSS
- **后端**: tRPC, Prisma
- **数据库**: SQLite
- **认证**: NextAuth.js

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

环境变量说明：
- `DATABASE_URL` - SQLite 数据库路径
- `NEXTAUTH_SECRET` - NextAuth 密钥
- `NEXT_PUBLIC_MEMOS_API_URL` - Memos API 地址（可选）
- `ADMIN_EMAIL` - 管理员邮箱
- `ADMIN_PASSWORD` - 管理员密码
- `ADMIN_NAME` - 管理员名称

### 3. 初始化数据库

```bash
npm run db:push    # 创建数据库表
npm run db:seed    # 创建管理员账户
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## AI 总结

入口：右上角用户下拉菜单 →「AI 总结配置」（`/settings/ai`）。

- **提供商**：可添加多个 OpenAI 兼容服务（名称 / 接口地址 / API Key / 模型），一个提供商对应一个模型，可启用或停用。总结时按添加顺序依次尝试，某个提供商报错会继续下一个；全部失败则本次总结失败。
- **提示词**：内置默认提示词，可用 `{{date}}`、`{{logs}}` 占位符；支持一键恢复默认。
- **自动总结**：默认每天 00:30（`Asia/Shanghai`）总结前一天，可在页面调整开关、时分和时区。服务在到点时未运行会在启动后补跑一次。
- **手动生成**：主页标题右侧与移动端工具栏的「AI 总结」按钮，对日历当前选中的日期生成；配置页也可选择任意日期生成。
- **结果写入**：总结内容写入被总结当天 `23:59` 的一条日志，并带 `#AI总结` 标签；重新生成会替换当天已有的 AI 总结。总结输入会排除所有带 `#AI总结` 的日志与评论。
- **调用历史**：配置页按每次总结分组展示每个提供商的耗时、成功/失败原因以及模型返回内容。

> 部署环境使用「镜像 + 宿主机挂载 SQLite」，流水线不执行 `prisma migrate`。新增的 AI 表与 `Log.source` 字段由 `src/server/ai/ensure-schema.ts` 在容器启动时幂等补齐（`src/instrumentation.ts` 触发），无需手工迁移。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行代码检查 |
| `npm run db:push` | 更新数据库 schema |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:seed` | 初始化数据库数据 |

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/login/       # 登录页面
│   ├── (dashboard)/        # 主界面
│   │   ├── admin/users/    # 用户管理
│   │   ├── settings/ai/    # AI 总结配置
│   │   └── page.tsx        # 日志管理主页
│   └── api/                # API 路由
│       ├── ai/             # AI 总结 / 提供商测试
│       ├── auth/           # NextAuth 认证
│       ├── trpc/           # tRPC 路由
│       └── open/log/       # OpenAPI 路由
├── components/             # React 组件
│   ├── ai/                 # AI 调用历史
│   ├── calendar/           # 日历组件
│   ├── quick-input/        # 快速标签输入
│   └── timeline/           # 日志时间线
├── server/                 # 服务端代码
│   ├── ai/                 # 提供商调用、总结流程、定时任务、建表补丁
│   ├── api/routers/        # tRPC 路由
│   ├── auth.ts             # 认证配置
│   └── db.ts               # 数据库连接
├── instrumentation.ts      # 启动钩子（补表结构 + 启动总结调度）
├── utils/                  # 工具函数
└── types/                  # 类型定义
prisma/
├── schema.prisma           # 数据库 schema
└── seed.ts                 # 初始化数据脚本
```

## 许可证

MIT