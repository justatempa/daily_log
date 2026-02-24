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
      setApiTokenStatus("Token generated.");
      await utils.user.getApiToken.invalidate();
    },
  });
  const revokeApiToken = api.user.revokeApiToken.useMutation({
    onSuccess: async () => {
      setApiToken("");
      setApiTokenStatus("Token cleared.");
      await utils.user.getApiToken.invalidate();
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
      setApiTokenStatus("Token copied.");
    } catch {
      setApiTokenStatus("Copy failed.");
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
      >
        {session?.user?.name ?? "Account"}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-lg">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Export / Import
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onExport}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                >
                  Import
                </button>
                <input
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
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Memos Token
              </p>
              <input
                value={memosToken}
                onChange={(event) => setMemosToken(event.target.value)}
                placeholder="Paste token"
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
              />
              <button
                type="button"
                onClick={() =>
                  updateMemos.mutate({
                    memosToken: memosToken.trim() ? memosToken.trim() : null,
                  })
                }
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
              >
                Save token
              </button>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Open API
              </p>
              <input
                value={apiToken}
                readOnly
                placeholder="Generate a token"
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => generateApiToken.mutate()}
                  disabled={generateApiToken.isLoading}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {apiToken ? "Regenerate" : "Generate token"}
                </button>
                <button
                  type="button"
                  onClick={onCopyApiToken}
                  disabled={!apiToken}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Copy
                </button>
              </div>
              <button
                type="button"
                onClick={() => revokeApiToken.mutate()}
                disabled={!apiToken || revokeApiToken.isLoading}
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Revoke token
              </button>
              <p className="mt-2 text-[11px] text-slate-400">
                POST /api/open/log with Authorization: Bearer &lt;token&gt;
              </p>
              {apiTokenStatus ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  {apiTokenStatus}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
