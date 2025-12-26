# Daily Log - 日程记录应用

一个基于 Next.js 和 Supabase 的个人日程时间轴记录应用。

## 功能特性

- ✅ 用户认证（注册/登录）
- ✅ 日程记录的增删改查
- ✅ 日历视图，显示有记录的日期
- ✅ 时间轴展示
- ✅ 快速输入面板
- ✅ 导出今日记录到剪贴板
- 🔄 数据实时同步到 Supabase

## 技术栈

- **前端框架**: Next.js 16 (App Router)
- **UI 样式**: Tailwind CSS v4
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **语言**: TypeScript

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Supabase

1. 在 [Supabase](https://supabase.com) 创建一个新项目
2. 在 Supabase SQL Editor 中执行 `database.sql` 文件中的 SQL 语句来创建数据表
3. 复制项目的 URL 和 anon key

### 3. 配置环境变量

编辑 `.env.local` 文件，填入你的 Supabase 凭证：

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 数据库结构

应用使用以下主要数据表：

- **profiles**: 用户配置信息
- **entries**: 日程记录条目
- **tags**: 标签系统
- **entry_tags**: 记录与标签的关联
- **external_accounts**: 外部账号集成（Memos、坚果云等）
- **backups**: 备份记录

详细的数据库结构请参考 `database.sql` 文件。

## 项目结构

```
app/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 主页面
│   └── globals.css        # 全局样式
├── components/            # React 组件
│   ├── AuthForm.tsx       # 登录/注册表单
│   ├── AuthProvider.tsx   # 认证上下文
│   ├── Header.tsx         # 页头组件
│   ├── CalendarPanel.tsx  # 日历面板
│   ├── TimelineList.tsx   # 时间轴列表
│   ├── QuickEntryPanel.tsx # 快速输入面板
│   ├── BottomComposer.tsx # 底部输入框
│   └── ToastProvider.tsx  # 提示消息
└── lib/                   # 工具库
    ├── supabase.ts        # Supabase 客户端
    ├── database.types.ts  # 数据库类型定义
    ├── profile.service.ts # 用户配置服务
    └── entries.service.ts # 记录条目服务
```

## 使用说明

### 注册/登录

首次访问应用时，你需要注册一个账号。注册后会收到验证邮件，点击邮件中的链接完成验证。

### 添加记录

1. 在日历中选择日期
2. 在快速输入面板或底部输入框中输入记录内容
3. 点击发送按钮或按 Enter 键提交

### 编辑/删除记录

- 点击记录条目右侧的编辑按钮可以修改内容
- 点击删除按钮可以删除记录

### 导出记录

点击"导出今日记录"按钮，当天的所有记录会被复制到剪贴板，可以粘贴到其他应用中。

## 待实现功能

- [ ] Memos 集成
- [ ] 坚果云备份
- [ ] 标签系统
- [ ] 搜索功能
- [ ] 数据统计
- [ ] 主题切换

## 开发

### 构建生产版本

```bash
npm run build
npm start
```

### 代码检查

```bash
npm run lint
```

## License

MIT

