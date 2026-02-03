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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create user</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as "ADMIN" | "USER")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
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
          className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white"
        >
          Create
        </button>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Users</h2>
        <div className="mt-4 space-y-3">
          {usersQuery.data?.map((user) => (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-400">{user.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                  {user.role}
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
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {user.isActive ? "Active" : "Disabled"}
                </button>
              </div>
            </div>
          ))}
          {usersQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-400">No users yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
