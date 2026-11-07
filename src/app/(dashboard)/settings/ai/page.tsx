"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import AiHistorySection from "@/components/ai/AiHistorySection";
import { api } from "@/utils/api";
import { postAiAction } from "@/utils/ai-client";
import { toLocalDayString } from "@/utils/datetime";
import { confirm } from "@/components/ui/confirm";

type SettingData = inferRouterOutputs<AppRouter>["ai"]["getSetting"];
type ProviderItem = SettingData["providers"][number];

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500";

const cardClass =
  "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70";

const primaryButtonClass =
  "rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClass =
  "rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300";

const dangerButtonClass =
  "rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-500 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10";

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
        checked
          ? "border-indigo-600 bg-indigo-600"
          : "border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-700"
      }`}
    >
      <span
        className={`absolute h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function StatusLine({
  message,
  tone = "neutral",
}: {
  message: string | null;
  tone?: "neutral" | "success" | "error";
}) {
  if (!message) return null;
  const color =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "error"
        ? "text-rose-500 dark:text-rose-400"
        : "text-slate-500 dark:text-slate-400";
  return (
    <p className={`mt-2 whitespace-pre-wrap text-xs ${color}`} role="status">
      {message}
    </p>
  );
}

export default function AiSettingsPage() {
  const utils = api.useUtils();
  const settingQuery = api.ai.getSetting.useQuery();

  // 自动总结设置
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [scheduleHour, setScheduleHour] = useState("0");
  const [scheduleMinute, setScheduleMinute] = useState("30");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);

  // 提示词
  const [prompt, setPrompt] = useState("");
  const [promptStatus, setPromptStatus] = useState<string | null>(null);

  // 提供商表单
  const [providerFormOpen, setProviderFormOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null,
  );
  const [providerForm, setProviderForm] = useState({
    name: "",
    baseUrl: "",
    model: "",
    apiKey: "",
    enabled: true,
  });
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    text: string;
  } | null>(null);

  // 手动生成
  const [manualDay, setManualDay] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return toLocalDayString(date);
  });
  const [manualPending, setManualPending] = useState(false);
  const [manualResult, setManualResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const initializedRef = useRef(false);

  useEffect(() => {
    const data = settingQuery.data;
    if (!data || initializedRef.current) return;
    setAutoEnabled(data.autoEnabled);
    setScheduleHour(String(data.scheduleHour));
    setScheduleMinute(String(data.scheduleMinute));
    setTimezone(data.timezone);
    setPrompt(data.prompt);
    initializedRef.current = true;
  }, [settingQuery.data]);

  const updateSchedule = api.ai.updateSchedule.useMutation({
    onSuccess: async () => {
      setScheduleStatus("自动总结设置已保存。");
      await utils.ai.getSetting.invalidate();
    },
    onError: (error) => setScheduleStatus(error.message),
  });

  const updatePrompt = api.ai.updatePrompt.useMutation({
    onSuccess: async () => {
      setPromptStatus("提示词已保存。");
      await utils.ai.getSetting.invalidate();
    },
    onError: (error) => setPromptStatus(error.message),
  });

  const resetPrompt = api.ai.resetPrompt.useMutation({
    onSuccess: async (data) => {
      setPrompt(data.prompt);
      setPromptStatus("已恢复默认提示词。");
      await utils.ai.getSetting.invalidate();
    },
    onError: (error) => setPromptStatus(error.message),
  });

  const saveProvider = api.ai.saveProvider.useMutation({
    onSuccess: async () => {
      setProviderStatus("提供商已保存。");
      setProviderFormOpen(false);
      setEditingProviderId(null);
      await utils.ai.getSetting.invalidate();
    },
    onError: (error) => setProviderStatus(error.message),
  });

  const setProviderEnabled = api.ai.setProviderEnabled.useMutation({
    onSuccess: async () => {
      await utils.ai.getSetting.invalidate();
    },
    onError: (error) => setProviderStatus(error.message),
  });

  const deleteProvider = api.ai.deleteProvider.useMutation({
    onSuccess: async () => {
      setProviderStatus("提供商已删除。");
      setTestResult(null);
      await utils.ai.getSetting.invalidate();
    },
    onError: (error) => setProviderStatus(error.message),
  });

  const providers = settingQuery.data?.providers ?? [];

  const scheduleLabel = useMemo(() => {
    const hour = Number(scheduleHour);
    const minute = Number(scheduleMinute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "--:--";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }, [scheduleHour, scheduleMinute]);

  const onSaveSchedule = () => {
    const hour = Number(scheduleHour);
    const minute = Number(scheduleMinute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      setScheduleStatus("小时需为 0–23 的整数。");
      return;
    }
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      setScheduleStatus("分钟需为 0–59 的整数。");
      return;
    }
    updateSchedule.mutate({
      autoEnabled,
      timezone: timezone.trim(),
      scheduleHour: hour,
      scheduleMinute: minute,
    });
  };

  const onSavePrompt = () => {
    if (!prompt.trim()) {
      setPromptStatus("提示词不能为空，可以点击「恢复默认」。");
      return;
    }
    updatePrompt.mutate({ prompt });
  };

  const onResetPrompt = async () => {
    if (
      !(await confirm({
        title: "恢复默认提示词？",
        description: "当前自定义的提示词内容会被覆盖。",
        confirmText: "恢复默认",
        tone: "danger",
      }))
    ) {
      return;
    }
    resetPrompt.mutate();
  };

  const openCreateProvider = () => {
    setEditingProviderId(null);
    setProviderForm({
      name: "",
      baseUrl: "",
      model: "",
      apiKey: "",
      enabled: true,
    });
    setProviderStatus(null);
    setProviderFormOpen(true);
  };

  const openEditProvider = (provider: ProviderItem) => {
    setEditingProviderId(provider.id);
    setProviderForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKey: "",
      enabled: provider.enabled,
    });
    setProviderStatus(null);
    setProviderFormOpen(true);
  };

  const onSubmitProvider = () => {
    if (
      !providerForm.name.trim() ||
      !providerForm.baseUrl.trim() ||
      !providerForm.model.trim()
    ) {
      setProviderStatus("请填写名称、接口地址和模型。");
      return;
    }
    if (!editingProviderId && !providerForm.apiKey.trim()) {
      setProviderStatus("新增提供商需要填写 API Key。");
      return;
    }
    saveProvider.mutate({
      id: editingProviderId ?? undefined,
      name: providerForm.name,
      baseUrl: providerForm.baseUrl,
      model: providerForm.model,
      apiKey: providerForm.apiKey,
      enabled: providerForm.enabled,
    });
  };

  const onTestProvider = async (providerId: string) => {
    setTestingId(providerId);
    setTestResult(null);
    const result = await postAiAction<{
      ok: true;
      message: string;
      durationMs: number;
    }>("/api/ai/test-provider", { providerId }, 60_000);

    setTestingId(null);
    if (result.ok) {
      const reply = result.data.message.replace(/\s+/g, " ").slice(0, 60);
      setTestResult({
        id: providerId,
        ok: true,
        text: `连接正常，返回「${reply}」，耗时 ${(
          result.data.durationMs / 1000
        ).toFixed(1)}s。`,
      });
    } else {
      setTestResult({ id: providerId, ok: false, text: result.error });
    }
    await utils.ai.history.invalidate();
  };

  const onDeleteProvider = async (provider: ProviderItem) => {
    if (
      !(await confirm({
        title: `删除提供商「${provider.name}」？`,
        description: "删除后不再参与总结，历史调用记录会保留。",
        confirmText: "删除",
        tone: "danger",
      }))
    ) {
      return;
    }
    deleteProvider.mutate({ id: provider.id });
  };

  const onManualSummary = async () => {
    if (!manualDay) {
      setManualResult({ ok: false, text: "请选择日期。" });
      return;
    }
    if (
      !(await confirm({
        title: `为 ${manualDay} 生成 AI 总结？`,
        description:
          "结果会作为日志插入当天 23:59，并带 #AI总结 标签；当天已有的 AI 总结会被替换。",
        confirmText: "开始生成",
      }))
    ) {
      return;
    }

    setManualPending(true);
    setManualResult(null);
    const result = await postAiAction<{
      ok: true;
      providerName: string;
      model: string;
      durationMs: number;
    }>("/api/ai/summarize", { day: manualDay });

    setManualPending(false);
    if (result.ok) {
      setManualResult({
        ok: true,
        text: `已生成并插入到 ${manualDay} 的日志（${result.data.providerName} · ${
          result.data.model
        } · ${(result.data.durationMs / 1000).toFixed(1)}s）。`,
      });
      await utils.ai.history.invalidate();
      await utils.log.getByDate.invalidate();
    } else {
      setManualResult({ ok: false, text: result.error });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
        >
          ← 返回仪表盘
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          AI 总结配置
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          配置 AI 提供商与提示词，每天自动总结前一天的日志；结果会作为一条带
          #AI总结 标签的日志插入被总结当天。
        </p>
      </div>

      {/* 自动总结 */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              每日自动总结
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              默认每天 00:30 总结「前一天」的日志。服务若在到点时未运行，启动后会自动补跑当天尚未执行的总结。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {autoEnabled ? "已开启" : "已关闭"}
            </span>
            <ToggleSwitch
              checked={autoEnabled}
              onChange={() => setAutoEnabled((value) => !value)}
              label="每日自动总结开关"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-slate-500 dark:text-slate-400">
            小时
            <input
              type="number"
              min={0}
              max={23}
              value={scheduleHour}
              onChange={(event) => setScheduleHour(event.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-xs text-slate-500 dark:text-slate-400">
            分钟
            <input
              type="number"
              min={0}
              max={59}
              value={scheduleMinute}
              onChange={(event) => setScheduleMinute(event.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-xs text-slate-500 dark:text-slate-400">
            时区（IANA）
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Shanghai"
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            当前：每天 {scheduleLabel}（{timezone || "—"}）总结前一天
            {settingQuery.data?.lastAutoRunDay
              ? ` · 最近自动执行日期 ${settingQuery.data.lastAutoRunDay}`
              : ""}
          </p>
          <button
            type="button"
            onClick={onSaveSchedule}
            disabled={updateSchedule.isLoading}
            className={primaryButtonClass}
          >
            {updateSchedule.isLoading ? "保存中…" : "保存设置"}
          </button>
        </div>
        <StatusLine message={scheduleStatus} />
      </section>

      {/* 提供商 */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              AI 提供商
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              支持多个 OpenAI 兼容提供商，一个提供商一个模型。按添加顺序依次尝试，第一个成功即采用；全部失败则本次总结失败。
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateProvider}
            className={secondaryButtonClass}
          >
            新增提供商
          </button>
        </div>

        {providerFormOpen ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/70 dark:bg-slate-900/30">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {editingProviderId ? "编辑提供商" : "新增提供商"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-500 dark:text-slate-400">
                名称
                <input
                  value={providerForm.name}
                  onChange={(event) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如 DeepSeek"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-xs text-slate-500 dark:text-slate-400">
                模型
                <input
                  value={providerForm.model}
                  onChange={(event) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      model: event.target.value,
                    }))
                  }
                  placeholder="例如 deepseek-chat"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">
                接口地址
                <input
                  value={providerForm.baseUrl}
                  onChange={(event) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      baseUrl: event.target.value,
                    }))
                  }
                  placeholder="https://api.deepseek.com/v1"
                  className={`mt-1 ${inputClass}`}
                />
                <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                  填到 /v1 即可，系统会自动补 /chat/completions；也可直接填完整地址。
                </span>
              </label>
              <label className="block text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">
                API Key
                <input
                  type="password"
                  value={providerForm.apiKey}
                  onChange={(event) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      apiKey: event.target.value,
                    }))
                  }
                  placeholder={
                    editingProviderId
                      ? "已保存，留空则保持不变"
                      : "粘贴 API Key"
                  }
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={providerForm.enabled}
                onChange={(event) =>
                  setProviderForm((prev) => ({
                    ...prev,
                    enabled: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 dark:border-slate-600"
              />
              保存后立即启用
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSubmitProvider}
                disabled={saveProvider.isLoading}
                className={primaryButtonClass}
              >
                {saveProvider.isLoading ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProviderFormOpen(false);
                  setEditingProviderId(null);
                }}
                className={secondaryButtonClass}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

        <StatusLine message={providerStatus} />

        {providers.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            还没有提供商。新增至少一个并启用后，自动/手动总结才能工作。
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700/70 dark:bg-slate-900/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                      {provider.name}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          provider.enabled
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
                        }`}
                      >
                        {provider.enabled ? "已启用" : "已停用"}
                      </span>
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                      {provider.model} · {provider.baseUrl}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      Key：{provider.apiKeyMasked || "未设置"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setProviderEnabled.mutate({
                          id: provider.id,
                          enabled: !provider.enabled,
                        })
                      }
                      disabled={setProviderEnabled.isLoading}
                      className={secondaryButtonClass}
                    >
                      {provider.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onTestProvider(provider.id)}
                      disabled={testingId === provider.id}
                      className={secondaryButtonClass}
                    >
                      {testingId === provider.id ? "测试中…" : "测试"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditProvider(provider)}
                      className={secondaryButtonClass}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteProvider(provider)}
                      disabled={deleteProvider.isLoading}
                      className={dangerButtonClass}
                    >
                      删除
                    </button>
                  </div>
                </div>
                {testResult?.id === provider.id ? (
                  <p
                    className={`mt-2 whitespace-pre-wrap break-words text-xs ${
                      testResult.ok
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-500 dark:text-rose-400"
                    }`}
                  >
                    {testResult.text}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 提示词 */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              总结提示词
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              可用占位符：{"{{date}}"}（被总结日期）、{"{{logs}}"}（当日日志）。缺少占位符时会自动把对应内容追加到末尾。
            </p>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {prompt.length} / 10000
          </span>
        </div>

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={14}
          className={`mt-3 min-h-[260px] resize-y text-sm leading-relaxed ${inputClass}`}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSavePrompt}
            disabled={updatePrompt.isLoading}
            className={primaryButtonClass}
          >
            {updatePrompt.isLoading ? "保存中…" : "保存提示词"}
          </button>
          <button
            type="button"
            onClick={onResetPrompt}
            disabled={resetPrompt.isLoading}
            className={secondaryButtonClass}
          >
            {resetPrompt.isLoading ? "恢复中…" : "恢复默认"}
          </button>
        </div>
        <StatusLine message={promptStatus} />

        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700/70 dark:bg-slate-900/30">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
            查看默认提示词
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {settingQuery.data?.defaultPrompt ?? ""}
          </pre>
        </details>
      </section>

      {/* 手动生成 */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          生成某天的总结
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          结果会作为一条日志插入所选当天 23:59，并带 #AI总结 标签；总结时不会把带 #AI总结 的日志算进去，重新生成会替换当天已有的 AI 总结。也可以在上方调用历史里对某天点「重新生成这天」。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={manualDay}
            onChange={(event) => setManualDay(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => void onManualSummary()}
            disabled={manualPending}
            className={primaryButtonClass}
          >
            {manualPending ? "生成中…" : "生成并插入日志"}
          </button>
        </div>
        {manualResult ? (
          <p
            className={`mt-2 whitespace-pre-wrap text-xs ${
              manualResult.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-500 dark:text-rose-400"
            }`}
            role="status"
          >
            {manualResult.text}
          </p>
        ) : null}
      </section>

      <AiHistorySection />
    </div>
  );
}
