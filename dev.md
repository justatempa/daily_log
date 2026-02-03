这是一个基于 Next.js (App Router)、T3 Stack、Prisma (SQLite) 和 Tailwind CSS 的完整开发文档设计。

---

# 日历时间轴应用重构开发文档

## 1. 项目概述

将原有的单页 HTML/LocalStorage 应用重构为全栈应用。采用现代化的 T3 Stack 架构，确保类型安全、良好的开发体验以及高性能。

*   **核心功能**：用户登录、日志（支持评论、TODO、标签）、快捷输入（标签分组管理）、数据导出/备份。
*   **权限系统**：基于 JWT 的身份验证，区分 Admin（管理员）和 User（普通用户）。
*   **数据隔离**：多租户设计，严格隔离用户数据。

## 2. 技术栈

*   **框架**: Next.js 14 (App Router)
*   **语言**: TypeScript
*   **样式**: Tailwind CSS
*   **数据库**: SQLite3
*   **ORM**: Prisma
*   **API层**: tRPC (类型安全的端到端 API)
*   **认证**: NextAuth.js (配置为 JWT 策略)
*   **验证**: Zod

## 3. 数据库设计

使用 Prisma 定义 Schema，主要包含 User（用户）、Log（日志）、QuickTag（快捷标签）三张表。

```prisma
// schema.prisma

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  USER
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String   // 存储哈希后的密码
  role      Role     @default(USER)
  secretKey String?  // 用于调用 API 的密钥
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  logs      Log[]
  quickTags QuickTag[]
}

model Log {
  id        String   @id @default(cuid())
  userId    String
  content   String
  date      DateTime // 用于时间轴和日历查询
  tags      String   // 以逗号分隔的字符串，如 "天气##晴,心情##开心"
  isTodo    Boolean  @default(false)

  // 评论功能 (自引用)
  parentId String?
  parent   Log?     @relation("LogComments", fields: [parentId], references: [id])
  replies  Log[]    @relation("LogComments")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id])
}

model QuickTag {
  id          String   @id @default(cuid())
  userId      String
  label       String   // 标签名，如 "晴"
  categoryName String   // 分类名，如 "天气"

  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id])
}
```

### 数据库特性说明
1.  **Log.parentId**: 实现评论功能，指向同表中的另一条记录 ID。
2.  **QuickTag**: 扁平化存储。修改分类名时，直接执行 `updateMany` 批量修改该 `userId` 下所有 `categoryName` 匹配的记录。
3.  **User.secretKey**: 用于第三方 API 调用鉴权。

## 4. tRPC 路由设计

### 4.1 认证与上下文

建立 `ctx` 包含 `user` 信息，并在中间件中进行鉴权。

```typescript
// src/server/api/trpc.ts
export const authMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const protectedProcedure = t.procedure.use(authMiddleware);

// 管理员中间件
export const adminMiddleware = t.middleware(({ ctx, next }) => {
  if (ctx.session?.user?.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next(ctx);
});
export const adminProcedure = t.procedure.use(adminMiddleware);
```

### 4.2 路由结构

```typescript
// src/server/api/root.ts
export const appRouter = router({
  auth: authRouter,
  user: userRouter,     // 仅管理员
  log: logRouter,       // 受保护
  quickTag: quickTagRouter, // 受保护
  setting: settingRouter,   // 受保护 (个人信息, Memos配置)
});
```

#### A. 日志模块
*   `getByDate`: 获取指定日期的所有主日志（`parentId IS NULL`）。
*   `getReplies`: 获取某条日志的评论。
*   `add`: 创建日志（支持输入 parentId 创建评论）。
*   `toggleTodo`: 切换 Todo 状态。
*   `delete`: 删除日志（级联删除评论或保留，视需求定）。
*   `import`: 导入 JSON 数据并解析入库。

#### B. 快捷标签模块
*   `getGrouped`: 返回结构如 `{ "天气": ["晴", "雨"], "心情": ["开心"] }`。
    *   *逻辑*: 在 Prisma 中获取所有标签，然后在内存中通过 JS reduce 分组，或使用原生 SQL `GROUP BY`。
*   `add`: 添加新标签。
*   `updateCategory`: 修改分类名（`updateMany`）。
*   `delete`: 删除标签。

#### C. 用户模块
*   `list`: (Admin) 获取所有用户列表。
*   `create`: (Admin) 新增用户。
*   `updateStatus`: (Admin) 禁用/启用用户 (`isActive`)。
*   `updateSecretKey`: (User) 更新自己的 API Key。

## 5. 前端架构

### 5.1 目录结构 (App Router)

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # 登录页
│   ├── (dashboard)/
│   │   ├── layout.tsx            # 仪表盘布局 (包含 Header, Sidebar等)
│   │   ├── page.tsx              # 主页：日历 + 时间轴
│   │   └── admin/
│   │       └── users/
│   │           └── page.tsx      # 用户管理页 (仅Admin)
│   └── api/
│       └── trpc/[...trpc]/route.ts  # tRPC Handler
├── components/
│   ├── ui/                       # Shadcn/UI 或基础 UI 组件
│   ├── calendar/                 # 日历组件
│   ├── timeline/                 # 时间轴列表
│   ├── quick-input/              # 快捷输入面板
│   ├── user-dropdown.tsx         # 用户头像下拉菜单 (导出/设置)
│   └── admin/                    # 管理员相关组件
├── server/
│   ├── api/
│   │   ├── root.ts               # tRPC 路由聚合
│   │   ├── routers/              # 各子路由
│   │   └── trpc.ts               # tRPC 上下文配置
│   └── auth.ts                   # NextAuth 配置
└── lib/
    └── utils.ts
```

### 5.2 核心组件复用逻辑

将原 HTML 中的逻辑拆解：

1.  **Calendar Component**:
    *   状态: `currentMonth`, `selectedDate`.
    *   数据源: `api.log.getByDate` (仅用于查询日期下是否有数据，显示小圆点).
    *   交互: 点击日期 -> 更新父组件 (Page) 的 `selectedDate` state.

2.  **Timeline Component**:
    *   Props: `selectedDate`.
    *   数据源: `api.log.getByDate`.
    *   渲染: 递归渲染评论。
    *   功能: Todo Checkbox 点击触发 `toggleTodo`.

3.  **QuickInput Component**:
    *   数据源: `api.quickTag.getGrouped`.
    *   交互:
        *   点击标签 -> 高亮选中.
        *   点击发送 -> 组装字符串 `分类##标签`，调用 `api.log.add`.

4.  **UserDropdown Component**:
    *   原 HTML 按钮栏的功能移入此处。
    *   **导出**: 调用前端逻辑生成 Blob 下载（因为数据已经在前端了）。
    *   **导入**: 文件选择器 -> 读取 JSON -> `api.log.import`.
    *   **Save to Memos**: 从 LocalStorage 或 Server Setting 读取 Memos Token，前端直接 fetch Memos API。

## 6. 详细功能实现指南

### 6.1 用户体系

1.  **登录**: 使用 NextAuth.js Credentials Provider。
    *   输入 Email/Password -> Server 验证 Hash -> 返回 JWT。
    *   前端使用 `useSession()` 获取状态。
2.  **权限控制**:
    *   页面级: `(dashboard)/admin/users/page.tsx` 检查 user.role === 'ADMIN'。
    *   API级: 使用 `adminProcedure` 包装 tRPC router。

### 6.2 日志与评论

*   **标签存储**: 为了兼容原逻辑，标签仍存为文本（如 `#天气#晴,#心情#好`）。如果需要更复杂的筛选，后期可迁移为关联表，但按需求目前存字段即可。
*   **Todo 实现**: `Log` 表增加 `isTodo` 字段。前端渲染时，如果是 Todo 状态，文字样式加删除线或前置 Checkbox。

### 6.3 快捷输入 (标签管理)

*   **表结构**: `QuickTag` 表。
*   **批量修改分类**:
    ```typescript
    // tRPC router
    updateCategory: protectedProcedure
      .input(z.object({ oldName: z.string(), newName: z.string() }))
      .mutation(({ ctx, input }) => {
        return ctx.prisma.quickTag.updateMany({
          where: { userId: ctx.session.user.id, categoryName: input.oldName },
          data: { categoryName: input.newName }
        });
      }),
    ```

### 6.4 导出与导入

*   **Memos/TOKEN**:
    *   创建 `UserSetting` 表或在 `User` 表增加字段 `memosToken`。
    *   下拉菜单中调用 `updateMemosToken` 接口保存。
    *   点击保存时，获取当前日期日志，拼接文本，使用 fetch 发送到 Memos Open API。
*   **本地导入/导出**:
    *   **导出**: 使用 `utils.api.log.getAll` (需添加该路由) 获取全量数据，`JSON.stringify`，触发浏览器下载。
    *   **导入**: `<input type="file">`，`FileReader` 读取，`api.log.import` (后端解析并 `createMany`)。

## 7. 开发步骤

### 第一阶段：脚手架与数据库
1.  `npm create t3-app@latest` (选择 NextAuth, Prisma, SQLite, Tailwind).
2.  修改 `schema.prisma`，定义 `User`, `Log`, `QuickTag`。
3.  `npx prisma db push` 初始化数据库。
4.  配置 NextAuth 使用 JWT 和 Credentials。

### 第二阶段：基础 UI 与布局
1.  创建登录界面 (`app/(auth)/login/page.tsx`)。
2.  创建主界面布局 (`app/(dashboard)/layout.tsx`)，包含顶部导航（用户头像）。
3.  复刻原 HTML 的 CSS 为 Tailwind 类名，创建基础组件。

### 第三阶段：核心业务逻辑
1.  **tRPC Routers**: 实现 `log` 和 `quickTag` 的 CRUD 接口。
2.  **日历组件**: 实现日期选择，连接 Timeline 数据。
3.  **时间轴组件**: 渲染日志，支持添加、删除、标记 Todo。
4.  **快捷输入**: 实现标签分组显示，选中->组合->提交流程。

### 第四阶段：高级功能与管理
1.  **评论功能**: 修改 Log 接口支持 `parentId`，前端实现递归渲染或平铺渲染。
2.  **用户管理**: 实现 Admin 页面，用户表格，状态切换。
3.  **工具迁移**: 将 Memos 备份、导入导出迁移至 UserDropdown 组件中。

### 第五阶段：优化与部署
1.  添加 Error Boundary 和 Loading 状态。
2.  SQLite 数据备份策略。
3.  部署至 Vercel (注意 SQLite 在 Vercel 需要配置持久化存储或直接使用文件系统)。

## 8. 注意事项

1.  **Data Security**: 确保 `protectedProcedure` 严格校验 `ctx.session.user.id`，防止跨用户数据访问（在 Prisma 查询中务必带上 `where: { userId: ctx.session.user.id }`）。
2.  **Performance**: 如果日志量巨大，Timeline 需要分页或无限滚动。初期可限制 `take(20)`。
3.  **Migration**: 用户可能需要导入旧版的 LocalStorage 数据，可以在用户下拉菜单提供一个“从旧版导入”的临时期入口，读取 LocalStorage 并提交到服务器。