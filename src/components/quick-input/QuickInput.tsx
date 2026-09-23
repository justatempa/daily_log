"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
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

const QuickInput = forwardRef<QuickInputHandle, {
  onTagsChange: (tags: TagGroup[]) => void;
  /**
   * 受外部控制的已选标签（父组件的 quickTags）。
   * 多个 QuickInput 实例（桌面侧栏 / 移动端弹层）共用同一份选中态，
   * 任一实例的变化都会通过 onTagsChange 回写，再经本 effect 同步到全部实例。
   */
  initialSelected?: TagGroup[];
}>(({ onTagsChange, initialSelected = [] }, ref) => {
  const { data, isLoading } = api.quickTag.getGrouped.useQuery();
  const utils = api.useUtils();
  const [selected, setSelected] = useState<SelectedTag[]>(() =>
    tagsToSelected(initialSelected),
  );
  const [newCategory, setNewCategory] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // 外部选中态变化（其他实例切换/发送后清空）时同步本实例的选中
  useEffect(() => {
    setSelected(tagsToSelected(initialSelected));
  }, [initialSelected]);

  const addMutation = api.quickTag.add.useMutation({
    onSuccess: async () => {
      setNewCategory("");
      setNewLabel("");
      await utils.quickTag.getGrouped.invalidate();
    },
  });

  useImperativeHandle(ref, () => ({
    clearSelection: () => {
      setSelected([]);
      onTagsChange([]);
    },
  }));

  const grouped = data ?? {};
  const entries = Object.entries(grouped);

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
      const map = new Map<string, string[]>();
      for (const item of newSelected) {
        if (!map.has(item.category)) {
          map.set(item.category, []);
        }
        map.get(item.category)?.push(item.label);
      }
      const tagGroups = Array.from(map.entries()).map(([category, labels]) => ({
        category,
        labels,
      }));
      onTagsChange(tagGroups);

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
        ) : entries.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            还没有标签，到下方添加一个吧。
          </p>
        ) : (
          entries.map(([category, labels]) => (
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

      <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          添加新标签
        </p>
        <div className="mt-2 flex gap-2">
          <label htmlFor="new-category" className="sr-only">
            分类名称
          </label>
          <input
            id="new-category"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="分类"
            className="w-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500"
          />
          <label htmlFor="new-label" className="sr-only">
            标签名称
          </label>
          <input
            id="new-label"
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
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
        >
          添加
        </button>
      </div>
    </section>
  );
});

QuickInput.displayName = "QuickInput";

export default QuickInput;