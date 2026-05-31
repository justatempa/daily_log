# Daily Log

一个简洁的日志管理应用，用于记录日常笔记和待办事项。

## 功能特性

- **日志记录** - 添加、编辑、删除日志条目
- **待办事项** - 支持 Todo 任务管理，可标记完成状态
- **标签系统** - 快速标签功能，支持分类管理
- **日历视图** - 按日期筛选查看日志
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
│   │   └── page.tsx        # 日志管理主页
│   └── api/                # API 路由
│       ├── auth/           # NextAuth 认证
│       ├── trpc/           # tRPC 路由
│       └── open/log/       # OpenAPI 路由
├── components/             # React 组件
│   ├── calendar/           # 日历组件
│   ├── quick-input/        # 快速标签输入
│   └── timeline/           # 日志时间线
├── server/                 # 服务端代码
│   ├── api/routers/        # tRPC 路由
│   ├── auth.ts             # 认证配置
│   └── db.ts               # 数据库连接
├── utils/                  # 工具函数
└── types/                  # 类型定义
prisma/
├── schema.prisma           # 数据库 schema
└── seed.ts                 # 初始化数据脚本
```

## 许可证

MIT