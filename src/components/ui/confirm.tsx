"use client";

import { useSyncExternalStore } from "react";
import { Dialog, DialogButton, DialogFooter } from "./dialog";

/**
 * 替代 window.confirm 的 Promise 化确认框。
 *
 * 用法（任意客户端代码里都能直接调用，不需要 hook）：
 *   if (!(await confirm({ title: "删除记录？", description: "不可恢复", tone: "danger" }))) return;
 *
 * 关闭方式（ESC / 遮罩 / 关闭按钮 / 取消）统一返回 false，不会留下未决 Promise。
 * 同时触发多个确认时按队列依次展示。
 */

export type ConfirmOptions = {
  title: string;
  /** 支持 \n 换行 */
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** danger 用于删除等破坏性操作：红色确认按钮，且默认聚焦「取消」 */
  tone?: "default" | "danger";
};

type ConfirmRequest = ConfirmOptions & {
  id: number;
  resolve: (value: boolean) => void;
};

const EMPTY: ConfirmRequest[] = [];
let queue: ConfirmRequest[] = EMPTY;
let nextId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return queue;
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  // 服务端没有可挂载的宿主，直接否决，避免 Promise 永久 pending
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    queue = [...queue, { ...options, id: ++nextId, resolve }];
    emit();
  });
}

function settle(value: boolean) {
  const [current, ...rest] = queue;
  queue = rest;
  emit();
  current?.resolve(value);
}

/** 挂在根 Providers 里，全局只需一个 */
export function ConfirmHost() {
  const requests = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const current = requests[0];
  if (!current) return null;

  const danger = current.tone === "danger";

  return (
    <Dialog
      key={current.id}
      open
      onClose={() => settle(false)}
      title={current.title}
      size="sm"
      description={
        current.description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {current.description}
          </p>
        ) : undefined
      }
      footer={
        <DialogFooter>
          <DialogButton
            variant="secondary"
            onClick={() => settle(false)}
            data-dialog-initial-focus={danger ? true : undefined}
          >
            {current.cancelText ?? "取消"}
          </DialogButton>
          <DialogButton
            variant={danger ? "danger" : "primary"}
            onClick={() => settle(true)}
            data-dialog-initial-focus={danger ? undefined : true}
          >
            {current.confirmText ?? "确定"}
          </DialogButton>
        </DialogFooter>
      }
    />
  );
}
