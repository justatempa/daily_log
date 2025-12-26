# Next.js + Supabase 重构设计

## 文档目的
- 梳理旧版 `log.html` 单页应用的功能、状态与依赖，确保迁移需求被完整捕捉。
- 为新版 Next.js + Supabase 项目提供可以直接交给 AI 代理执行的目标架构说明与实现边界。
- 明确数据模型、关键路由、外部集成和迁移路径，降低多次往返沟通成本。

## 旧版单页应用梳理

### 技术栈与依赖
- 纯静态 HTML 文件，直接通过浏览器加载 (`log.html`)，无构建流程。
- UI 依赖 CDN 版本的 TailwindCSS 与 Font Awesome（行内 `<script src="https://cdn.tailwindcss.com"></script>` 和 `<link ... font-awesome>`）。
- 页面逻辑全部在单个 `<script>` 内部实现，使用原生 DOM API 与少量 CSS 类切换。

### 页面结构与主要功能
1. **头部区域**：显示今日日期、提供 Token 设置、Memos 上传、坚果云备份/恢复、导出等操作按钮。
2. **右侧日历**：可切换月份并选择日期，带有“当日是否存在记录”的指示点（`createCalendarDay`）。
3. **主时间轴**：滚动列表展示指定日期的所有记录，支持编辑、删除、时间戳展示（`renderTimeline` / `createTimelineItem`）。
4. **快捷输入卡片**：天气、心情、任务、活动、维生素等标签按钮，组合后可一次性写入一条记录（`setupQuickInputListeners`）。
5. **底部固定输入区**：自由文本输入 + 发送按钮，按 Enter 或点击发送生成记录（`addRecord`）。
6. **模态与通知**：Token/备份文件夹弹窗、确认弹窗、Toast 通知等均在同一文件内动态创建与销毁。

### 数据与状态
- 运行时核心状态：`records`（对象，键为 `YYYY-MM-DD`，值为 `[{ message, timestamp }]` 数组）、`currentDate`/`selectedDate` 等。
- 数据持久化完全依赖浏览器 `localStorage`：
  - `timelineRecords`：所有日记。
  - `memosToken`：访问 `https://memos.911250.xyz/api/v1/memos` 的 Bearer Token。
  - `jianguoyunConfig`：本地备份建议文件夹、文件前缀以及 WebDAV 预留字段。
- `records` 示例：
  ```json
  {
    "2024-12-15": [
      { "message": "天气##晴\n心情##平静", "timestamp": "2024-12-15T04:21:33.000Z" },
      { "message": "跑步 5km", "timestamp": "2024-12-15T12:05:10.000Z" }
    ]
  }
  ```

### 外部交互
- **Memos**：将当日记录拼接为纯文本后，通过前端 fetch 直接调用 Public API；失败时只展示 Toast。
- **坚果云/本地备份**：实质是浏览器触发 JSON 下载 + 自定义弹窗提示手动存储，恢复流程读取本地 JSON 再写回 `records`。

### 现有痛点
- 仅运行在单一浏览器环境，本地存储无法跨设备/多端同步，且缺乏用户体系。
- 所有令牌保存在 `localStorage`，没有加密或隔离，存在安全风险。
- 备份需要手动下载和导入 JSON，无法增量或自动备份。
- 无后端导致无法扩展（搜索、统计、协作、移动端接口等）。

## 重构目标
1. 迁移到 Next.js + Supabase，提供云端数据存储、鉴权与 API 能力。
2. 复刻甚至增强旧版的交互体验（时间轴、日历、快捷输入、导出、Memos 推送、备份提示）。
3. 提供更安全的 Token 管理、可扩展的数据模型以及自动/脚本化的迁移路径。
4. 让不同终端（桌面浏览器、移动 Web、潜在的 App）都可以共享数据。

## 新版架构设计

### 技术选型
- **Next.js 14 (App Router + Server Actions)**，TypeScript，ESLint + Prettier + SWC。
- **Supabase**：Auth、Postgres、RLS、Edge Functions。
- **UI/状态**：TailwindCSS、Shadcn/UI 组件、TanStack Query（客户端 mutations）+ React Hook Form。
- **实用库**：Zod（参数校验）、Day.js/Luxon（日期处理）、Supabase JS SDK（服务端/客户端各一份）。

### 路由与目录建议
```
app/
  layout.tsx                # 全局布局
  (marketing)/page.tsx      # 可选登录/介绍页
  (app)/layout.tsx          # 需要鉴权的区域
  (app)/dashboard/page.tsx  # 默认视图（含日历+时间轴）
  (app)/entries/[date]/page.tsx  # 深链接日期页
  (app)/settings/page.tsx   # Token、备份、快捷选项配置
  api/
    entries/route.ts        # GET/POST/DELETE
    exports/route.ts        # JSON/CSV 导出
    integrations/memos/route.ts  # 将数据推送到 Memos
components/...
lib/
  supabase/...
  validators/...
```

| 路由 | 说明 |
| --- | --- |
| `/dashboard` | 默认加载当前日期且展示左右布局（日历 + 时间轴 + 快捷输入）。 |
| `/entries/[date]` | 可分享/书签的日期视图，SSR 预取数据并在客户端实时更新。 |
| `/settings` | 管理 Memos Token、备份偏好、快捷标签集合等。 |
| `/api/*` | Route Handlers，提供受 RLS 保护的数据访问以及第三方集成代理。 |

### 主要组件/Hook
- `CalendarPanel`：基于 Supabase 聚合数据（每日日志数量、心情统计）渲染日历。
- `TimelineList`：虚拟化列表，展示 `entry` 详细信息及操作（编辑、删除、导出）。
- `QuickEntryPanel`：读取用户自定义模板（天气/心情等）生成按钮，提交时调用 `createEntry` mutation。
- `BottomComposer`：自由文本输入，支持多行、快捷键和拖拽片段。
- `SettingsForm`：受控表单，调用 Supabase RPC/Update 持久化配置。
- `useEntries(date)`：封装 TanStack Query + Supabase fetch；`useMutateEntry()` 暴露新增/修改/删除 API。

### 状态管理与数据流
- 服务器组件负责初次渲染：`loadEntries(date)` 通过 Supabase 服务密钥查询后以 props 传给客户端组件。
- 客户端使用 Supabase JS（携带会话）进行实时操作；成功后乐观更新 Query Cache。
- 快捷输入按钮维护局部 UI 状态（选中状态、禁用状态），提交成功后重置。
- 通知统一由 Toast Provider 实现，取代旧版散落的 DOM 注入逻辑。

## Supabase 数据模型与安全

### 建议表结构
```sql
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  timezone text default 'Asia/Shanghai',
  memos_token text,
  backup_folder text,
  quick_templates jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  recorded_at timestamptz not null default now(),
  content text not null,
  metadata jsonb default '{}'::jsonb,
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index entries_user_date_idx on public.entries (user_id, entry_date);
create index entries_metadata_gin_idx on public.entries using gin (metadata);
```

- `metadata` 约定字段：`weather: string[]`, `mood: string[]`, `tasks: string[]`, `activities: string[]`, `vitamins: string[]`.
- 可根据需要再扩展 `attachments`, `location`, `tags`。

### RLS 策略
```sql
alter table public.entries enable row level security;
create policy "Entries are user scoped"
  on public.entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.profiles enable row level security;
create policy "Profiles are user scoped"
  on public.profiles for select using (auth.uid() = id);
```

### 集成策略
- **Memos 推送**：`POST /api/integrations/memos` 读取当前用户 `memos_token`，服务端向 Memos API 发起请求，避免 Token 暴露给浏览器。可加入速率限制和失败重试。
- **备份/导出**：`GET /api/exports?date=2024-12-15` 生成 JSON 或 Markdown；也可以调用 Supabase Edge Function 批量导出整月数据并上传到对象存储。
- **快速模板**：存储在 `profiles.quick_templates`，客户端拉取后渲染按钮；允许用户在设置页自定义。

## API 与 Server Actions
- `createEntry({ entryDate, content, metadata })`：写入 `entries`；Server Action 内部做 Zod 校验。
- `updateEntry(id, payload)` / `deleteEntry(id)`：用于编辑、删除时间轴项。
- `getEntriesByDate(date)`：在 Server Component 中调用，用于 SSR 日历和时间轴。
- `getDateSummary(range)`：聚合每日日志数量，用于日历指示点。
- `triggerMemosExport(date)`：聚合某日记录并推送到 Memos。
- `exportEntries(format, range)`：生成 JSON/CSV/Markdown，前端提供下载。

## 数据迁移与开发流程

### 迁移策略
1. **新增导出脚本**：在旧站点中加入一个隐藏按钮或控制台脚本，将 `localStorage.timelineRecords` 序列化并下载（结构已与 Supabase 目标兼容）。
2. **Next.js 导入向导**：在 `/settings/import` 中提供上传 JSON 的界面，前端解析后按日期批量调用 `createEntry` Server Action。
3. **Token/配置迁移**：同一 JSON 中可附带 `memosToken` 与 `jianguoyunConfig`，导入时写入 `profiles` 表。
4. **校验**：导入完成后生成摘要（导入记录数、失败条目），并允许重新导入（幂等，可以基于 `recorded_at` + `content` 做去重）。

### 迭代里程碑
1. **Milestone 1**：建立 Next.js 骨架、Supabase schema、登录流程、`/dashboard` 读取并渲染时间轴（无快捷输入）。
2. **Milestone 2**：实现创建/编辑/删除 entry、快捷输入、多日历交互、导出 JSON。
3. **Milestone 3**：设置页、Memos 推送、导入向导、备份提示、通知中心。
4. **Milestone 4**：额外优化（搜索、统计、移动端响应式、PWA）。

##  需要确认
- Memos 需要可配置的自建地址
- 坚果云相关配置目前只用于提示用户保存到本地文件夹，新版计划真正对接 WebDAV/对象存储
- 不需要多用户共享同一天日记或团队协作，按当前设计默认 1:1（用户:数据）。
- 是否需要保留离线工作的能力（例如 IndexedDB 缓存 + Service Worker）

> 文档面向 AI 代理，可直接据此拆分任务：先建 Supabase schema + RLS，再搭 Next.js App Router，最后补齐导出/集成/迁移工具。
