"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const utils = api.useUtils();
  const usersQuery = api.user.list.useQuery(undefined, {
    enabled: session?.user.role === "ADMIN",
  });
  const createUser = api.user.create.useMutation({
    onSuccess: async () => {
      await utils.user.list.invalidate();
    },
  });
  const updateStatus = api.user.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.user.list.invalidate();
    },
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");

  if (session?.user.role !== "ADMIN") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          需要管理员权限。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="create-user-title"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70"
      >
        <h2
          id="create-user-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          创建用户
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label htmlFor="new-user-name" className="sr-only">
            名称
          </label>
          <input
            id="new-user-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="名称"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
          />
          <label htmlFor="new-user-email" className="sr-only">
            邮箱
          </label>
          <input
            id="new-user-email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="邮箱"
            type="email"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
          />
          <label htmlFor="new-user-password" className="sr-only">
            密码
          </label>
          <input
            id="new-user-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="密码"
            type="password"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
          />
          <label htmlFor="new-user-role" className="sr-only">
            角色
          </label>
          <select
            id="new-user-role"
            value={role}
            onChange={(event) => setRole(event.target.value as "ADMIN" | "USER")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
          >
            <option value="USER">普通用户</option>
            <option value="ADMIN">管理员</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() =>
            createUser.mutate({
              name,
              email,
              password,
              role,
            })
          }
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
        >
          创建
        </button>
      </section>

      <section
        aria-labelledby="user-list-title"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70"
      >
        <h2
          id="user-list-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          用户列表
        </h2>
        <div className="mt-4 space-y-3">
          {usersQuery.data?.map((user) => (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-700"
            >
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {user.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user.email}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                  {user.role === "ADMIN" ? "管理员" : "普通用户"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateStatus.mutate({
                      id: user.id,
                      isActive: !user.isActive,
                    })
                  }
                  className={`rounded-full px-3 py-1 text-xs ${
                    user.isActive
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
                  }`}
                >
                  {user.isActive ? "正常" : "已停用"}
                </button>
              </div>
            </div>
          ))}
          {usersQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              暂无用户。
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}