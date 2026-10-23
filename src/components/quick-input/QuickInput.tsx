"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { api } from "@/utils/api";
import { type TagGroup } from "@/utils/tags";

type SelectedTag = {
  category: string;
  label: string;
};

export type QuickInputHandle = {
  clearSelection: () => void;
};

function tagsToSelected(groups: TagGroup[]): SelectedTag[] {
  return groups.flatMap((group) =>
    group.labels.map((label) => ({ category: group.category, label })),
  );
}

function selectedToGroups(selected: SelectedTag[]): TagGroup[] {
  const map = new Map<string, string[]>();
  for (const item of selected) {
    if (!map.has(item.category)) {
      map.set(item.category, []);
    }
    map.get(item.category)?.push(item.label);
  }
  return Array.from(map.entries()).map(([category, labels]) => ({
    category,
    labels,
  }));
}

/**
 * 快捷输入面板：纯选择器。
 * 新增 / 删除 / 重命名 / 排序 / 隐藏等管理操作统一在「用户菜单 → 快捷输入管理」弹窗中进行。
 * 隐藏（hidden=true）的标签不在此处展示。
 */
const QuickInput = forwardRef<
  QuickInputHandle,
  {
    onTagsChange: (tags: TagGroup[]) => void;
    /**
     * 受外部控制的已选标签（父组件的 quickTags）。
     * 多个 QuickInput 实例（桌面侧栏 / 移动端弹层）共用同一份选中态，
     * 任一实例的变化都会通过 onTagsChange 回写，再经本 effect 同步到全部实例。
     */
    initialSelected?: TagGroup[];
  }
>(({ onTagsChange, initialSelected = [] }, ref) => {
  const { data, isLoading } = api.quickTag.list.useQuery();
  const [selected, setSelected] = useState<SelectedTag[]>(() =>
    tagsToSelected(initialSelected),
  );

  // 外部选中态变化（其他实例切换/发送后清空）时同步本实例的选中
  useEffect(() => {
    setSelected(tagsToSelected(initialSelected));
  }, [initialSelected]);

  useImperativeHandle(ref, () => ({
    clearSelection: () => {
      setSelected([]);
      onTagsChange([]);
    },
  }));

  // 按分类分组（只展示未隐藏的标签），顺序沿用管理弹窗中的排序
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of data ?? []) {
      if (item.hidden) continue;
      if (!map.has(item.categoryName)) {
        map.set(item.categoryName, []);
      }
      map.get(item.categoryName)?.push(item.label);
    }
    return Array.from(map.entries()).map(([category, labels]) => ({
      category,
      labels,
    }));
  }, [data]);

  const toggleTag = (category: string, label: string) => {
    setSelected((prev) => {
      const exists = prev.find(
        (item) => item.category === category && item.label === label,
      );
      const newSelected = exists
        ? prev.filter(
            (item) => item.category !== category || item.label !== label,
          )
        : [...prev, { category, label }];

      // 通知父组件标签变化
      onTagsChange(selectedToGroups(newSelected));
      return newSelected;
    });
  };

  return (
    <section
      aria-labelledby="quick-input-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/70"
    >
      <div className="flex items-center justify-between">
        <h3
          id="quick-input-title"
          className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400"
        >
          快捷输入
        </h3>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            标签加载中…
          </p>
        ) : grouped.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            还没有标签，可在右上角用户菜单的「快捷输入管理」中添加。
          </p>
        ) : (
          grouped.map(({ category, labels }) => (
            <div key={category}>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {category}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {labels.map((label) => {
                  const isSelected = selected.some(
                    (item) =>
                      item.category === category && item.label === label,
                  );
                  return (
                    <button
                      key={`${category}-${label}`}
                      type="button"
                      onClick={() => toggleTag(category, label)}
                      aria-pressed={isSelected}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50 text-indigo-600 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300"
                          : "border-slate-200 text-slate-500 hover:border-indigo-200 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-400"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
});

QuickInput.displayName = "QuickInput";

export default QuickInput;
