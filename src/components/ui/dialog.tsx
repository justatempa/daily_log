"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * 全站统一的弹窗外壳：零依赖，基于项目已有的 Tailwind 设计语言
 * （rounded-2xl / slate 边框 / indigo 主色 / dark 适配）。
 *
 * 自带：Portal 到 body、遮罩、ESC 关闭、滚动锁定、焦点约束与恢复、
 * 层级递增（后打开的弹窗永远在上层，且只有最上层响应 ESC）。
 */

/** 每次打开都递增，保证确认框盖在业务弹窗之上 */
let zCounter = 100;
/** 弹窗栈，只有栈顶响应 ESC / Tab */
const dialogStack: symbol[] = [];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZE_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** 无标题时用来自定义无障碍名称 */
  ariaLabel?: string;
  showClose?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  /** 覆盖内容区样式（例如已有自己的 padding / 滚动容器） */
  bodyClassName?: string;
  /** 面板额外样式 */
  className?: string;
};

export function Dialog(props: DialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Portal 需要 document；且只在打开时挂载内部层，保证 z-index / 栈按打开顺序分配
  if (!mounted || !props.open || typeof document === "undefined") return null;
  return <DialogLayer {...props} />;
}

function DialogLayer({
  onClose,
  children,
  title,
  description,
  footer,
  size = "md",
  ariaLabel,
  showClose = true,
  closeOnBackdrop = true,
  closeOnEsc = true,
  bodyClassName,
  className = "",
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [zIndex] = useState(() => ++zCounter);
  const [token] = useState(() => Symbol("dialog"));
  // onClose 常是内联箭头函数，用 ref 避免因引用变化反复重建副作用
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialogStack.push(token);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;

      if (event.key === "Escape" && closeOnEsc) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const nodes = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((node) => node.getClientRects().length > 0);
      if (nodes.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const frame = requestAnimationFrame(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>(
          "[data-dialog-initial-focus]",
        ) ?? panelRef.current;
      target?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      const index = dialogStack.indexOf(token);
      if (index >= 0) dialogStack.splice(index, 1);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus?.({ preventScroll: true });
    };
  }, [token, closeOnEsc]);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
    >
      <div
        className="dialog-backdrop absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        className={`dialog-panel relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl outline-none dark:border-slate-700 dark:bg-slate-800 ${SIZE_CLASS[size]} ${className}`}
      >
        {title || showClose ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
            <h2
              id={titleId}
              className="text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h2>
            {showClose ? (
              <button
                type="button"
                onClick={() => onCloseRef.current()}
                aria-label="关闭"
                className="-mr-1 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}

        {description || children ? (
          <div
            className={`min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${bodyClassName ?? "px-5 py-4"}`}
          >
            {description}
            {children}
          </div>
        ) : null}

        {footer ? (
          <div className="shrink-0 border-t border-slate-100 px-5 py-3 dark:border-slate-700">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

const BUTTON_BASE =
  "rounded-lg px-4 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const BUTTON_VARIANT: Record<"primary" | "secondary" | "danger", string> = {
  primary:
    "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400",
  secondary:
    "border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-slate-50 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-500 focus-visible:outline-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500",
};

export type DialogButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function DialogButton({
  variant = "secondary",
  className = "",
  type = "button",
  ...rest
}: DialogButtonProps) {
  return (
    <button
      type={type}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

export function DialogFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`}>
      {children}
    </div>
  );
}
