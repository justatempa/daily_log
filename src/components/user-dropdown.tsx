"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { api } from "@/utils/api";

export default function UserDropdown() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [memosToken, setMemosToken] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [apiTokenStatus, setApiTokenStatus] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  const utils = api.useUtils();
  const memosQuery = api.setting.getMemosToken.useQuery();
  const apiTokenQuery = api.user.getApiToken.useQuery();
  const updateMemos = api.setting.updateMemosToken.useMutation({
    onSuccess: async () => {
      await utils.setting.getMemosToken.invalidate();
    },
  });
  const generateApiToken = api.user.generateApiToken.useMutation({
    onSuccess: async (data) => {
      setApiToken(data.apiToken ?? "");
      setApiTokenStatus("令牌已生成。");
      await utils.user.getApiToken.invalidate();
    },
  });
  const revokeApiToken = api.user.revokeApiToken.useMutation({
    onSuccess: async () => {
      setApiToken("");
      setApiTokenStatus("令牌已清除。");
      await utils.user.getApiToken.invalidate();
    },
  });
  const changePassword = api.setting.changePassword.useMutation({
    onSuccess: () => {
      setPasswordStatus("密码修改成功");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (error) => {
      setPasswordStatus(error.message || "密码修改失败");
    },
  });

  useEffect(() => {
    if (memosQuery.data?.memosToken !== undefined) {
      setMemosToken(memosQuery.data.memosToken ?? "");
    }
  }, [memosQuery.data?.memosToken]);

  useEffect(() => {
    if (apiTokenQuery.data?.apiToken !== undefined) {
      setApiToken(apiTokenQuery.data.apiToken ?? "");
    }
  }, [apiTokenQuery.data?.apiToken]);

  const onCopyApiToken = async () => {
    if (!apiToken) return;
    try {
      await navigator.clipboard.writeText(apiToken);
      setApiTokenStatus("已复制。");
    } catch {
      setApiTokenStatus("复制失败。");
    }
  };

  const exportLogs = api.log.getAll.useQuery(undefined, {
    enabled: false,
  });

  const importLogs = api.log.import.useMutation({
    onSuccess: async () => {
      await utils.log.getByDate.invalidate();
    },
  });

  const onExport = async () => {
    const result = await exportLogs.refetch();
    if (!result.data) return;

    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `daily-log-export-${new Date().toISOString()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as Array<{
      content: string;
      date: string;
      tags?: string;
      isTodo?: boolean;
    }>;

    const items = parsed.map((item) => ({
      content: item.content,
      date: new Date(item.date),
      tags: item.tags ?? "",
      isTodo: item.isTodo ?? false,
    }));

    importLogs.mutate({ items });
  };

  const userName = session?.user?.name ?? "账户";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`用户菜单（${userName}）`}
        aria-expanded={open}
        title={userName}
        className="max-w-[10rem] truncate rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
      >
        {userName}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                数据导出 / 导入
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onExport}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                >
                  导出
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                >
                  导入
                </button>
                <label htmlFor="import-file" className="sr-only">
                  导入日志文件
                </label>
                <input
                  id="import-file"
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onImport(file);
                    }
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Memos Token
              </p>
              <label htmlFor="memos-token" className="sr-only">
                Memos Token
              </label>
              <input
                id="memos-token"
                value={memosToken}
                onChange={(event) => setMemosToken(event.target.value)}
                placeholder="粘贴 Token"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() =>
                  updateMemos.mutate({
                    memosToken: memosToken.trim() ? memosToken.trim() : null,
                  })
                }
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
              >
                保存 Token
              </button>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Open API
              </p>
              <label htmlFor="api-token" className="sr-only">
                API 令牌
              </label>
              <input
                id="api-token"
                value={apiToken}
                readOnly
                placeholder="点击生成令牌"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => generateApiToken.mutate()}
                  disabled={generateApiToken.isLoading}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                >
                  {apiToken ? "重新生成" : "生成令牌"}
                </button>
                <button
                  type="button"
                  onClick={onCopyApiToken}
                  disabled={!apiToken}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                >
                  复制
                </button>
              </div>
              <button
                type="button"
                onClick={() => revokeApiToken.mutate()}
                disabled={!apiToken || revokeApiToken.isLoading}
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
              >
                撤销令牌
              </button>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                POST /api/open/log，请求头 Authorization: Bearer &lt;token&gt;
              </p>
              {apiTokenStatus ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" role="status">
                  {apiTokenStatus}
                </p>
              ) : null}
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                修改密码
              </p>
              <label htmlFor="current-password" className="sr-only">
                当前密码
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="当前密码"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <label htmlFor="new-password" className="sr-only">
                新密码
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="新密码（至少 6 位）"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => {
                  if (!currentPassword || !newPassword) {
                    setPasswordStatus("请填写完整信息");
                    return;
                  }
                  if (newPassword.length < 6) {
                    setPasswordStatus("新密码至少6位");
                    return;
                  }
                  changePassword.mutate({
                    currentPassword,
                    newPassword,
                  });
                }}
                disabled={changePassword.isLoading}
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
              >
                修改密码
              </button>
              {passwordStatus ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" role="status">
                  {passwordStatus}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500"
            >
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}