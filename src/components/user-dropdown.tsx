"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { api } from "@/utils/api";

export default function UserDropdown() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [memosToken, setMemosToken] = useState("");

  const utils = api.useUtils();
  const memosQuery = api.setting.getMemosToken.useQuery();
  const updateMemos = api.setting.updateMemosToken.useMutation({
    onSuccess: async () => {
      await utils.setting.getMemosToken.invalidate();
    },
  });

  useEffect(() => {
    if (memosQuery.data?.memosToken !== undefined) {
      setMemosToken(memosQuery.data.memosToken ?? "");
    }
  }, [memosQuery.data?.memosToken]);

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
