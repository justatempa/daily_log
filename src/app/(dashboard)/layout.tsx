import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import UserDropdown from "@/components/user-dropdown";
import NavLinks from "@/components/nav-links";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-indigo-50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 dark:text-slate-100">
      {/* 跳到主内容（键盘用户） */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
      >
        跳到主要内容
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
          <div className="shrink-0">
            <p className="whitespace-nowrap text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">
              Daily Log
            </p>
            <h1 className="whitespace-nowrap text-lg font-semibold dark:text-slate-100">
              日志时间线
            </h1>
          </div>
          <nav
            aria-label="主导航"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-300"
          >
            <NavLinks isAdmin={session.user.role === "ADMIN"} />
            <UserDropdown />
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}