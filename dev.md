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

## 9. AI 总结（新增）

### 9.1 功能边界

* 每天 00:30（按用户配置的时区）自动总结「前一天」的日志。
* 主页标题右侧 / 移动端工具栏「AI 总结」按钮：总结日历当前选中的日期。
* 配置页 `/settings/ai`：可对任意日期手动生成；调用历史按每次总结分页（每页 10 组），可直接对某天「重新生成这天」。
* 结果写成被总结当天 `23:59` 的一条日志，内容末尾带 `#AI总结`；`Log.source = "AI_SUMMARY"`。
* 重新总结会先删除当天 `source=AI_SUMMARY` 的日志再插入，且收集输入时排除所有内容含 `#AI总结` 的日志与评论（不会自我总结）。
* 多个提供商按添加顺序 fallback，单个失败继续下一个；全部失败抛出 `ALL_FAILED`，不写总结日志。
* 自动总结成功后通过 Bark 推送（分组 `daily-log`），手动生成不推送；正文只放提供商、耗时和摘要开头，控制在 200 字内，避免 iOS 通知截断。

### 9.2 数据模型

在原有 `User` / `Log` / `QuickTag` 之外新增：

* `AiProvider`：`name` / `baseUrl` / `apiKey` / `model` / `enabled`，按 `createdAt` 升序作为 fallback 顺序。
* `AiSetting`：每用户一条，`prompt`、`autoEnabled`、`timezone`（默认 `Asia/Shanghai`）、`scheduleHour`（0）、`scheduleMinute`（30）、`lastAutoRunDay`。
* `AiCallLog`：一次总结共享 `runId`，记录每个提供商的 `status` / `error` / `content` / `durationMs` / `trigger`（AUTO / MANUAL / TEST）。
* `Log.source`：`AI_SUMMARY` 标记，用于替换旧总结与前端识别。

### 9.3 服务端结构

```
src/server/ai/
├── config.ts          # 默认值、常量、读取设置、Key 脱敏
├── default-prompt.ts  # 默认提示词 + buildPrompt（缺占位符自动补齐）
├── providers.ts       # OpenAI 兼容地址归一化 + 带超时的 fetch 调用
├── summary.ts         # summarizeDay / testAiProvider / AiSummaryError
├── bark.ts            # 自动总结完成后的 Bark 推送（group=daily-log）
├── scheduler.ts       # 60s tick，按用户时区判断是否到点
└── ensure-schema.ts   # 幂等建表 / Log.source 补列
src/instrumentation.ts # Node 启动时 ensure + startAiSummaryScheduler
src/app/api/ai/        # summarize / test-provider（REST，避开 tRPC 15s 超时）
```

* 模型调用超时 60s（连通性测试 30s），前端 `postAiAction` 超时 240s。
* 单次送入模型的日志上限 20000 字符，超出截断并提示。
* 日期边界统一按用户时区换算成 UTC 后查库（`src/utils/datetime.ts`），避免服务器时区影响「日」的归属。

### 9.4 默认提示词

```
你是一位温和、克制的私人日记助理。下面是一天（{{date}}）的日志记录，请据此写一份中文总结。

要求：
1. 只依据给出的日志内容，不编造、不推测未提到的事实；信息不足时如实说明。
2. 输出 200–400 字，纯文本，分 3–4 段短句，可用「·」开头；不使用 Markdown 标题、表格或代码块。当天内容较少时可以更短，不要为凑字数重复或空泛扩写。
3. 概括当天的主要事项与进展、情绪与状态变化，以及值得记住的细节。
4. 日志中标记为未完成的待办（[ ]）单独列出提醒；已完成的待办不必逐条罗列。
5. 语气平实，像写给本人看的回顾，不要空泛鼓励和套话。
6. 最后用一句话给出明天可执行的小建议；若日志中有明确的待办或目标，围绕它给建议。

【当日日志】
{{logs}}
```

设计取舍：

* 明确「只依据日志、不编造」，抑制模型补写不存在的情节。
* 限字 + 分段 + 禁用 Markdown，保证结果能直接作为一条日志渲染。
* 未完成待办单独列出，让总结具备行动价值；已完成的不重复罗列。
* 末尾一句明日建议，避免空泛鼓励，同时保持简短。
* `{{date}}` / `{{logs}}` 是可替换占位符；用户删掉占位符时 `buildPrompt` 会把日期和日志追加到末尾，不会丢输入。

### 9.5 部署与迁移

线上是单容器 + 宿主机挂载 `/app/db.sqlite`，GitHub Actions 只做 `docker build/load/run`，没有 `prisma migrate`。因此：

1. `server.js` 启动时通过 `experimental.instrumentationHook` 执行 `ensureAiSchema()`；
2. 三张表用 `CREATE TABLE IF NOT EXISTS`，索引用 `CREATE INDEX IF NOT EXISTS`；
3. `Log.source` 通过 `PRAGMA table_info` 检查后 `ALTER TABLE ADD COLUMN`；
4. tRPC context 与 AI REST 路由也会兜底调用一次（失败只记日志，不阻断普通日志功能）。

本地开发仍需 `npm run db:push` + `npm run db:generate`。

## 10. 图片附件（新增）

### 10.1 功能边界

* 输入区（桌面 / 移动）可点「添加图片」选图，也支持直接 `Ctrl+V` 粘贴截图；一条日志最多 9 张。
* 选中即上传（不必等日志发出），上传完成后输入区显示缩略图；可单张移除，失败可点重试。
* 时间轴按缩略图展示，点开看**压缩图**（长边 1600 webp），再点「查看原图」才加载原始文件。
* 删除日志时连带删除该日志（含其评论）的图片文件；「选了图但一直没发」的图片 24 小时后自动回收。
* 图片只对本人可见：读取接口按登录用户过滤，非本人一律 404。

### 10.2 存储与三档图

数据量不大，直接落本地文件夹（`UPLOAD_DIR`，默认 `./uploads`，容器内 `/app/uploads`），不入对象存储。每张图存三份：

| 变体 | 生成方式 | 用途 |
| --- | --- | --- |
| original | 上传字节原样保存（仅按真实格式定扩展名） | 「查看原图」、下载 |
| medium | `sharp().rotate().resize({1600, fit: inside, withoutEnlargement}).webp({quality:80})` | 大图预览默认加载 |
| thumb | 同上，长边 480、quality 72 | 时间轴 / 输入区缩略图 |

* 压缩与缩略都在服务端做，客户端只上传原始文件，结果稳定且不依赖浏览器 canvas 实现。
* `rotate()` 会按 EXIF 方向自动摆正（手机竖拍不会横躺），入库的 `width/height` 也是摆正后的显示尺寸，前端据此算占位比例。
* 原图不改写，压缩失败也不影响原图可用性；写入失败会回滚已写的文件，不留半套数据。
* 目录结构：`uploads/images/YYYY/MM/<日期串>-<uuid>-orig.<ext> | -md.webp | -thumb.webp`。

### 10.3 数据模型

`LogImage`：`userId` / `logId?`（上传后先为空，随日志提交时关联）/ `name` / `mime` / `size`（原图字节）/ `mediumSize` / `width` / `height` / `originalPath` / `mediumPath` / `thumbPath` / `sortOrder`。

* 路径存**相对上传根目录**的正斜杠路径，读取时统一经 `resolveStoredPath()` 校验，拒绝任何跳出根目录的路径。
* `Log.images`、`User.logImages` 为反向关系；`logId` 外键 `ON DELETE CASCADE`。

### 10.4 接口

```
src/server/image/storage.ts        # saveLogImage / deleteLogImageFiles / cleanupOrphanImages
src/app/api/images/upload/route.ts # POST multipart：鉴权 → 校验大小/格式 → 三档落盘 → 返回 id 与尺寸
src/app/api/images/[id]/[variant]/route.ts  # GET thumb|medium|original，流式返回，private immutable 缓存
src/app/api/images/[id]/route.ts   # DELETE 未归属日志的图片（已归属的返回 409，随日志删除）
```

* 上传走 REST 而非 tRPC：multipart 文件不适合 tRPC 序列化。
* 单张上限 20MB、单请求最多 9 张；格式按 sharp 识别的真实格式判定（JPG/PNG/WebP/GIF/AVIF），不信任扩展名。
* `log.add` 新增 `imageIds`：只接受本人名下、未归属其它日志的图片，按传入顺序写 `sortOrder`；同一 `clientId` 重发时会把漏挂的图片补挂上。
* `log.getByDate` / `log.search` 一并返回 `images`（按 `sortOrder`）。

### 10.5 前端

```
src/components/image/useImageAttachments.ts   # 上传队列（objectURL 本地预览 → 服务端缩略图）
src/components/image/ImageAttachmentBar.tsx   # ImageAttachButton + ImageAttachmentPreview
src/components/image/LogImageGrid.tsx         # 缩略图墙 + Dialog 大图（压缩图/原图切换）
src/utils/image.ts                            # imageUrl() / formatBytes() / 常量
```

* 上传中禁止发送（`attachments.uploading` 时按钮置灰），避免日志发出后图片还在路上。
* 列表里的图只做「提示有图」，单图上限 `160px`，多图九宫格整体 `240px`（3 列），点开才看大图。
* 输入区高度统一：桌面 Todo / 加图 / 输入框 / 发送都是 `52px`，移动端都是 `40px`，`items-end` 保证多行输入时底边对齐。
* 大图复用统一 `Dialog`（项目零依赖弹窗），不再单独写一套 lightbox。
* 带图日志发送成功后会对当天 `getByDate` 做一次 `invalidate`：缓存里的图片记录（尺寸/大小）以服务端为准。

### 10.6 部署注意

* 线上已给 `docker run` 增加 `-v "$APP_DIR/uploads:/app/uploads"`，容器重建不丢图；`start.sh` 同步加了这个挂载。
* `LogImage` 表由 `ensureAiSchema()` 在生产启动时幂等创建，老库无需手动迁移。
* standalone 产物在 `next.config.mjs` 通过 `outputFileTracingIncludes` 显式带上 `sharp` 与 `@img/*` 原生二进制。

## 11. 相册（新增）

### 11.1 功能边界

* 只收录**已归属日志**的图片（`logId != null`），上传后没发出去的孤儿图不进相册。
* 按「日志日期」倒序归档：日期分组标题 + 当天缩略图网格；点图开大图弹窗（默认压缩图，可切原图）。
* 每条日志都能跳转回它在仪表盘上的位置：`/?date=YYYY-MM-DD` 打开那一天，`/?date=YYYY-MM-DD&log=<logId>` 还会把该条日志滚进视野并高亮 3 秒。
* 未做：按标签/关键字筛选相册、图片下载、批量删除。

### 11.2 接口

```
src/server/api/routers/log.ts  # log.listImages：{ page?, pageSize? } → { items, total, page, pageSize, hasMore }
```

* 分页用 offset（`page` 从 1 起、`pageSize` 默认 48 上限 100），按 `[{ log: { date: "desc" } }, { sortOrder: "asc" }, { createdAt: "asc" }]` 排序——Prisma 支持按「对一关联」的字段排序。
* 每项返回 `{ id, width, height, name, size, mediumSize, logId, logDate, logTitle }`，`logTitle` 由服务端把正文压成一行、截 48 字（`snippetOf()`），列表不传整段正文。

### 11.3 前端

```
src/app/(dashboard)/gallery/page.tsx     # 相册页：日期分组网格 + 大图 Dialog + 加载更多
src/components/nav-links.tsx             # 桌面头部导航「仪表盘 / 搜索 / 相册」
src/app/(dashboard)/page.tsx             # 移动端工具栏相册图标入口 + ?date=/?log= 深链解析
src/components/timeline/Timeline.tsx     # highlightLogId：滚到目标日志并短暂高亮（data-log-id + ring）
```

* 入口落位：桌面走 `NavLinks`（移动端看不到它）；移动端放首页工具栏第二行右侧的图标胶囊（和 AI总结/隐私 同一排），**不占底部输入区**——那里刚做过 40px 等高校准。
* 相册页沿用搜索页范式：移动端 `lg:hidden` 的「返回记录」链接、圆角时间线卡片、`Dialog size="lg"` + 深色 `bodyClassName`。
* 大图弹窗 footer：尺寸/原图/压缩体积（左）+「查看原图」「看这天」「看这条日志」（右，`flex-col` 在窄屏自动换行）；左右箭头在当前已加载的图片间循环切换。
* 深链只认一次：`appliedDeepLink` ref 保证 `?date=` / `?log=` 只应用一次，之后手动切日期不会被 URL 拽回去。

