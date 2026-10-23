"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "@/utils/api";

type QuickTagItem = {
  id: string;
  categoryName: string;
  label: string;
  sortOrder: number;
  hidden: boolean;
};

type Group = { category: string; tags: QuickTagItem[] };

function groupItems(items: QuickTagItem[]): Group[] {
  const map = new Map<string, QuickTagItem[]>();
  for (const item of items) {
    if (!map.has(item.categoryName)) {
      map.set(item.categoryName, []);
    }
    map.get(item.categoryName)!.push(item);
  }
  return Array.from(map.entries()).map(([category, tags]) => ({
    category,
    tags,
  }));
}

/** 将分组拍平为完整 id 顺序，提交给 reorder 接口 */
function flattenIds(groups: Group[]): string[] {
  return groups.flatMap((group) => group.tags.map((tag) => tag.id));
}

/**
 * 快捷输入管理弹窗（用户菜单 → 快捷输入管理）：
 * 新增 / 删除 / 编辑（重命名）/ 排序 / 隐藏，全部作用于快捷标签本身，
 * 不影响已经添加的日志（日志中的标签是发送时的快照）。
 */
export default function QuickInputManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = api.quickTag.list.useQuery();
  const utils = api.useUtils();
  const [newCategory, setNewCategory] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [renamingLabelId, setRenamingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  const invalidateList = async () => {
    await utils.quickTag.list.invalidate();
  };

  const addMutation = api.quickTag.add.useMutation({
    onSuccess: async () => {
      setNewCategory("");
      setNewLabel("");
      await invalidateList();
    },
  });
  const deleteMutation = api.quickTag.delete.useMutation({
    onSuccess: invalidateList,
  });
  const deleteCategoryMutation = api.quickTag.deleteCategory.useMutation({
    onSuccess: invalidateList,
  });
  const updateLabelMutation = api.quickTag.updateLabel.useMutation({
    onSuccess: invalidateList,
  });
  const updateCategoryMutation = api.quickTag.updateCategory.useMutation({
    onSuccess: invalidateList,
  });
  const setHiddenMutation = api.quickTag.setHidden.useMutation({
    onSuccess: invalidateList,
  });
  const reorderMutation = api.quickTag.reorder.useMutation({
    onSuccess: invalidateList,
  });

  // 拖动排序状态：dragPreviewIds 非空时用它渲染预览顺序
  const [dragState, setDragState] = useState<{
    type: "category" | "tag";
    id: string;
  } | null>(null);
  const [dragPreviewIds, setDragPreviewIds] = useState<string[] | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const orderedItems = useMemo(() => {
    if (!data) return [];
    if (!dragPreviewIds) return data;
    const byId = new Map(data.map((item) => [item.id, item]));
    return dragPreviewIds
      .map((id) => byId.get(id))
      .filter((item): item is QuickTagItem => Boolean(item));
  }, [data, dragPreviewIds]);

  // 渲染分组（拖动预览时按预览顺序）
  const groups = useMemo(() => groupItems(orderedItems), [orderedItems]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // 弹窗挂到 document.body：组件渲染在带 backdrop-blur 的顶栏内，
  // 直接 fixed 会以顶栏为包含块导致弹窗被顶到页面顶部且只显示一部分
  if (typeof document === "undefined") return null;

  /** 开始拖动 */
  const startDrag = (
    event: DragEvent,
    type: "category" | "tag",
    id: string,
  ) => {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDragState({ type, id });
    setDragPreviewIds(flattenIds(groupItems(data ?? [])));
  };

  /** 拖动结束（落空 / 取消 / 已松开） */
  const endDrag = () => {
    setDragState(null);
    setDragPreviewIds(null);
    setDragOverTarget(null);
  };

  /** 分类行拖过：把被拖分类整块移动到目标分类位置 */
  const handleCategoryDragOver = (targetCategory: string) => {
    if (!dragState || dragState.type !== "category") return;
    if (dragState.id === targetCategory) return;
    const current = groupItems(orderedItems);
    const srcIdx = current.findIndex((g) => g.category === dragState.id);
    const dstIdx = current.findIndex((g) => g.category === targetCategory);
    if (srcIdx < 0 || dstIdx < 0) return;
    const next = [...current];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(srcIdx < dstIdx ? dstIdx - 1 : dstIdx, 0, moved);
    setDragPreviewIds(flattenIds(next));
    setDragOverTarget(targetCategory);
  };

  /** 标签行拖过：同一分类内调整位置（不跨分类） */
  const handleTagDragOver = (targetCategory: string, targetId: string) => {
    if (!dragState || dragState.type !== "tag") return;
    if (dragState.id === targetId) return;
    const current = groupItems(orderedItems);
    const srcGi = current.findIndex((g) =>
      g.tags.some((t) => t.id === dragState.id),
    );
    const dstGi = current.findIndex((g) => g.category === targetCategory);
    if (srcGi < 0 || dstGi < 0 || srcGi !== dstGi) return;
    const tags = current[dstGi].tags;
    const srcIdx = tags.findIndex((t) => t.id === dragState.id);
    const dstIdx = tags.findIndex((t) => t.id === targetId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const next = current.map((g) => ({ ...g, tags: [...g.tags] }));
    const [moved] = next[dstGi].tags.splice(srcIdx, 1);
    next[dstGi].tags.splice(srcIdx < dstIdx ? dstIdx - 1 : dstIdx, 0, moved);
    setDragPreviewIds(flattenIds(next));
    setDragOverTarget(targetId);
  };

  /** 松开：提交当前预览顺序 */
  const handleDrop = () => {
    const preview = dragPreviewIds;
    const original = flattenIds(groupItems(data ?? []));
    endDrag();
    if (preview && preview.join(",") !== original.join(",")) {
      reorderMutation.mutate({ ids: preview });
    }
  };

  const handleDeleteLabel = (tag: QuickTagItem, category: string) => {
    if (
      !window.confirm(
        `删除快捷标签「${category}：${tag.label}」？\n仅删除该快捷输入，已添加的日志不受影响。`,
      )
    ) {
      return;
    }
    if (renamingLabelId === tag.id) {
      setRenamingLabelId(null);
      setLabelDraft("");
    }
    deleteMutation.mutate({ id: tag.id });
  };

  const handleDeleteCategory = (category: string) => {
    const count =
      groups.find((g) => g.category === category)?.tags.length ?? 0;
    if (
      !window.confirm(
        `删除分类「${category}」及其全部 ${count} 个标签？\n仅删除快捷输入，已添加的日志不受影响。`,
      )
    ) {
      return;
    }
    if (renamingCategory === category) {
      setRenamingCategory(null);
      setCategoryDraft("");
    }
    deleteCategoryMutation.mutate({ categoryName: category });
  };

  const saveRenameCategory = (category: string) => {
    const next = categoryDraft.trim();
    if (!next) return;
    if (next === category) {
      setRenamingCategory(null);
      setCategoryDraft("");
      return;
    }
    updateCategoryMutation.mutate({ oldName: category, newName: next });
    setRenamingCategory(null);
    setCategoryDraft("");
  };

  const saveRenameLabel = (tag: QuickTagItem) => {
    const next = labelDraft.trim();
    if (!next) return;
    if (next === tag.label) {
      setRenamingLabelId(null);
      setLabelDraft("");
      return;
    }
    updateLabelMutation.mutate({ id: tag.id, label: next });
    setRenamingLabelId(null);
    setLabelDraft("");
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="快捷输入管理"
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            快捷输入管理
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
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
        </div>

        <div
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop();
          }}
        >
          {/* 新增 */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              新增标签
            </p>
            <div className="mt-2 flex gap-2">
              <label htmlFor="qm-category" className="sr-only">
                分类名称
              </label>
              <input
                id="qm-category"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="分类"
                className="w-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
              />
              <label htmlFor="qm-label" className="sr-only">
                标签名称
              </label>
              <input
                id="qm-label"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="标签"
                className="w-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!newCategory.trim() || !newLabel.trim()) return;
                addMutation.mutate({
                  categoryName: newCategory.trim(),
                  label: newLabel.trim(),
                });
              }}
              disabled={addMutation.isLoading}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
            >
              添加
            </button>
          </div>

          {/* 列表 */}
          {isLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              标签加载中…
            </p>
          ) : groups.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              还没有标签，先在上方添加。
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.category}>
                  {/* 分类行：拖动手柄拖动整个分类排序 */}
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      handleCategoryDragOver(group.category);
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-1 py-0.5 ${
                      dragOverTarget === group.category
                        ? "ring-2 ring-indigo-300 dark:ring-indigo-500"
                        : ""
                    }`}
                  >
                    <span
                      draggable
                      onDragStart={(event) =>
                        startDrag(event, "category", group.category)
                      }
                      onDragEnd={endDrag}
                      title="拖动排序"
                      aria-label={`拖动排序分类 ${group.category}`}
                      className={`cursor-grab text-slate-300 transition hover:text-indigo-500 dark:text-slate-500 dark:hover:text-indigo-300 ${
                        dragState?.type === "category" &&
                        dragState.id === group.category
                          ? "opacity-40"
                          : ""
                      }`}
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
                          d="M7 20V4M17 20V4"
                        />
                      </svg>
                    </span>

                    {renamingCategory === group.category ? (
                      <>
                        <input
                          autoFocus
                          value={categoryDraft}
                          onChange={(event) =>
                            setCategoryDraft(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveRenameCategory(group.category);
                            } else if (event.key === "Escape") {
                              setRenamingCategory(null);
                              setCategoryDraft("");
                            }
                          }}
                          aria-label="新的分类名称"
                          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => saveRenameCategory(group.category)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingCategory(null);
                            setCategoryDraft("");
                          }}
                          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {group.category}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingCategory(group.category);
                            setCategoryDraft(group.category);
                          }}
                          aria-label={`重命名分类 ${group.category}`}
                          title="重命名分类"
                          className="p-1 text-slate-400 transition hover:text-indigo-600 dark:hover:text-indigo-300"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(group.category)}
                          aria-label={`删除分类 ${group.category}`}
                          title="删除整个分类"
                          className="p-1 text-slate-400 transition hover:text-rose-500 dark:hover:text-rose-400"
                        >
                          <svg
                            className="h-3.5 w-3.5"
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
                      </>
                    )}
                  </div>

                  {/* 标签行 */}
                  <ul className="mt-2 space-y-1.5">
                    {group.tags.map((tag) => (
                      <li
                        key={tag.id}
                        onDragOver={(event) => {
                          event.preventDefault();
                          handleTagDragOver(group.category, tag.id);
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
                          tag.hidden
                            ? "border-slate-100 bg-slate-50 opacity-70 dark:border-slate-700/60 dark:bg-slate-800/60"
                            : "border-slate-100 bg-white dark:border-slate-700/60 dark:bg-slate-900/40"
                        } ${
                          dragOverTarget === tag.id
                            ? "ring-2 ring-indigo-300 dark:ring-indigo-500"
                            : ""
                        }`}
                      >
                        <span
                          draggable
                          onDragStart={(event) =>
                            startDrag(event, "tag", tag.id)
                          }
                          onDragEnd={endDrag}
                          title="拖动排序"
                          aria-label={`拖动排序标签 ${tag.label}`}
                          className={`cursor-grab text-slate-300 transition hover:text-indigo-500 dark:text-slate-500 dark:hover:text-indigo-300 ${
                            dragState?.type === "tag" && dragState.id === tag.id
                              ? "opacity-40"
                              : ""
                          }`}
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
                              d="M7 20V4M17 20V4"
                            />
                          </svg>
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setHiddenMutation.mutate({
                              id: tag.id,
                              hidden: !tag.hidden,
                            })
                          }
                          aria-label={
                            tag.hidden
                              ? `显示标签 ${tag.label}`
                              : `隐藏标签 ${tag.label}`
                          }
                          title={tag.hidden ? "已隐藏，点击显示" : "点击隐藏"}
                          className={`shrink-0 p-1 transition ${
                            tag.hidden
                              ? "text-amber-500 hover:text-amber-600"
                              : "text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300"
                          }`}
                        >
                          {tag.hidden ? (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>

                        {renamingLabelId === tag.id ? (
                          <>
                            <input
                              autoFocus
                              value={labelDraft}
                              onChange={(event) =>
                                setLabelDraft(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  saveRenameLabel(tag);
                                } else if (event.key === "Escape") {
                                  setRenamingLabelId(null);
                                  setLabelDraft("");
                                }
                              }}
                              aria-label="新的标签名称"
                              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => saveRenameLabel(tag)}
                              className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingLabelId(null);
                                setLabelDraft("");
                              }}
                              className="shrink-0 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            <span
                              className={`min-w-0 flex-1 truncate text-xs ${
                                tag.hidden
                                  ? "text-slate-400 line-through"
                                  : "text-slate-700 dark:text-slate-200"
                              }`}
                            >
                              {tag.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingLabelId(tag.id);
                                setLabelDraft(tag.label);
                              }}
                              aria-label={`重命名标签 ${tag.label}`}
                              title="重命名标签"
                              className="shrink-0 p-1 text-slate-400 transition hover:text-indigo-600 dark:hover:text-indigo-300"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLabel(tag, group.category)}
                              aria-label={`删除标签 ${tag.label}`}
                              title="删除标签"
                              className="shrink-0 p-1 text-slate-400 transition hover:text-rose-500 dark:hover:text-rose-400"
                            >
                              <svg
                                className="h-3.5 w-3.5"
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
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            拖动左侧手柄可调整分类与标签顺序；隐藏的标签不会在主页面显示；编辑、删除只影响快捷输入本身，不影响已添加的日志。
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
