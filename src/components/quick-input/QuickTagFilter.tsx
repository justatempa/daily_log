"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/utils/api";

export type SelectedTag = {
  category: string;
  label: string;
};

export interface QuickTagFilterProps {
  selectedTags: SelectedTag[];
  onChange: (tags: SelectedTag[]) => void;
}

export default function QuickTagFilter({
  selectedTags,
  onChange,
}: QuickTagFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { data: rawTags, isLoading } = api.quickTag.list.useQuery();

  // 快捷标签按分类分组（只展示未隐藏的标签）
  const groupedTags = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of rawTags ?? []) {
      if (item.hidden) continue;
      if (!map.has(item.categoryName)) {
        map.set(item.categoryName, []);
      }
      map.get(item.categoryName)!.push(item.label);
    }
    return Array.from(map.entries()).map(([category, labels]) => ({
      category,
      labels,
    }));
  }, [rawTags]);

  // 根据搜索关键字过滤标签
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groupedTags;
    return groupedTags
      .map(({ category, labels }) => {
        const categoryMatches = category.toLowerCase().includes(q);
        const matchedLabels = categoryMatches
          ? labels
          : labels.filter((label) => label.toLowerCase().includes(q));
        return {
          category,
          labels: matchedLabels,
        };
      })
      .filter((g) => g.labels.length > 0);
  }, [groupedTags, searchQuery]);

  // 点击外部及按下 ESC 键关闭下拉面板
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const isTagSelected = (category: string, label: string) =>
    selectedTags.some(
      (item) => item.category === category && item.label === label,
    );

  const toggleTag = (category: string, label: string) => {
    const exists = isTagSelected(category, label);
    if (exists) {
      onChange(
        selectedTags.filter(
          (item) => !(item.category === category && item.label === label),
        ),
      );
    } else {
      onChange([...selectedTags, { category, label }]);
    }
  };

  const removeTag = (category: string, label: string) => {
    onChange(
      selectedTags.filter(
        (item) => !(item.category === category && item.label === label),
      ),
    );
  };

  const clearAll = () => {
    onChange([]);
  };

  // 全选或取消当前分类下的全部标签
  const toggleCategoryAll = (category: string, labels: string[]) => {
    const allSelected = labels.every((l) => isTagSelected(category, l));
    if (allSelected) {
      onChange(selectedTags.filter((item) => item.category !== category));
    } else {
      const newSelected = [...selectedTags];
      for (const label of labels) {
        if (!newSelected.some((item) => item.category === category && item.label === label)) {
          newSelected.push({ category, label });
        }
      }
      onChange(newSelected);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          快捷输入
        </p>

        {/* 触发下拉弹层的按钮 */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
            selectedTags.length > 0 || isOpen
              ? "border-indigo-600 bg-indigo-50 text-indigo-600 shadow-xs dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300"
              : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          }`}
        >
          <svg
            className="h-3.5 w-3.5 text-current opacity-80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          {selectedTags.length > 0
            ? `已选 ${selectedTags.length} 个标签`
            : "选择快捷标签"}
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* 逻辑提示徽标 */}
        {selectedTags.length > 1 && (
          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            或逻辑 (OR)
          </span>
        )}

        {/* 清空已选按钮 */}
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400"
          >
            清空已选
          </button>
        )}
      </div>

      {/* 已选标签列表（外露展示，支持点击 × 快捷删除） */}
      {selectedTags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {selectedTags.map((item) => (
            <span
              key={`${item.category}-${item.label}`}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/70 px-2.5 py-0.5 text-xs text-indigo-700 dark:border-indigo-800/80 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              <span className="font-semibold text-indigo-500 dark:text-indigo-400">
                {item.category}:
              </span>
              <span>{item.label}</span>
              <button
                type="button"
                onClick={() => removeTag(item.category, item.label)}
                aria-label={`移除 ${item.category} 的 ${item.label}`}
                className="ml-0.5 rounded-full p-0.5 text-indigo-400 hover:bg-indigo-200/70 hover:text-indigo-900 dark:text-indigo-400 dark:hover:bg-indigo-800 dark:hover:text-indigo-100"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 隐藏式下拉浮层 */}
      {isOpen && (
        <>
          {/* 移动端全屏轻遮罩 */}
          <div
            className="fixed inset-0 z-20 bg-slate-900/20 backdrop-blur-xs sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="快捷输入标签筛选"
            className="absolute left-0 top-full z-30 mt-2 w-full min-w-[300px] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:w-[420px] dark:border-slate-700 dark:bg-slate-800"
          >
            {/* 浮层头部 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  快捷输入标签
                </h4>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                  多选为或逻辑
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="关闭筛选菜单"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
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

            {/* 搜索框 */}
            {groupedTags.length > 0 && (
              <div className="mt-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索标签..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-indigo-300 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-indigo-500"
                />
              </div>
            )}

            {/* 标签列表 */}
            <div className="mt-3 max-h-64 space-y-3.5 overflow-y-auto pr-1">
              {isLoading ? (
                <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  标签加载中...
                </p>
              ) : groupedTags.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  暂无快捷标签，可在右上角「快捷输入管理」中添加。
                </p>
              ) : filteredGroups.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  无匹配标签
                </p>
              ) : (
                filteredGroups.map(({ category, labels }) => {
                  const allSelected = labels.every((l) =>
                    isTagSelected(category, l),
                  );
                  return (
                    <div key={category} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {category}
                        </span>
                        {labels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggleCategoryAll(category, labels)}
                            className="text-[11px] text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400"
                          >
                            {allSelected ? "取消全选" : "全选"}
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {labels.map((label) => {
                          const active = isTagSelected(category, label);
                          return (
                            <button
                              key={`${category}-${label}`}
                              type="button"
                              onClick={() => toggleTag(category, label)}
                              aria-pressed={active}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                                active
                                  ? "border-indigo-600 bg-indigo-600 font-medium text-white shadow-xs"
                                  : "border-slate-200 bg-slate-50/50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                              }`}
                            >
                              {active && (
                                <svg
                                  className="h-3 w-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 浮层底部操作栏 */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-700/60">
              <span className="text-slate-400 dark:text-slate-500">
                已选 {selectedTags.length} 个（满足任意即可）
              </span>
              <div className="flex items-center gap-2">
                {selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-lg px-2 py-1 text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg bg-indigo-600 px-3 py-1 font-medium text-white transition hover:bg-indigo-700"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
