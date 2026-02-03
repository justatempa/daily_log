import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import UserDropdown from "@/components/user-dropdown";

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
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-indigo-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-500">Daily Log</p>
            <h1 className="text-lg font-semibold">Calendar Timeline</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link className="hover:text-indigo-600" href="/">
              Dashboard
            </Link>
            {session.user.role === "ADMIN" ? (
              <Link className="hover:text-indigo-600" href="/admin/users">
                Admin
              </Link>
            ) : null}
            <UserDropdown />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
