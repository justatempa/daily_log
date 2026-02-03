"use client";

import { useMemo, useState } from "react";
import { api } from "@/utils/api";
import { type TagGroup } from "@/utils/tags";

type SelectedTag = {
  category: string;
  label: string;
};

export default function QuickInput({
  onSend,
}: {
  onSend: (tags: TagGroup[]) => void;
}) {
  const { data, isLoading } = api.quickTag.getGrouped.useQuery();
  const utils = api.useUtils();
  const [selected, setSelected] = useState<SelectedTag[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const addMutation = api.quickTag.add.useMutation({
    onSuccess: async () => {
      setNewCategory("");
      setNewLabel("");
      await utils.quickTag.getGrouped.invalidate();
    },
  });

  const grouped = data ?? {};
  const entries = Object.entries(grouped);

  const toggleTag = (category: string, label: string) => {
    setSelected((prev) => {
      const exists = prev.find(
        (item) => item.category === category && item.label === label,
      );
      if (exists) {
        return prev.filter(
          (item) => item.category !== category || item.label !== label,
        );
      }
      return [...prev, { category, label }];
    });
  };

  const tagGroups = useMemo(() => {
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
  }, [selected]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-indigo-500">
          Quick Input
        </p>
        <button
          type="button"
          onClick={() => {
            if (tagGroups.length > 0) {
              onSend(tagGroups);
              setSelected([]);
            }
          }}
          disabled={tagGroups.length === 0}
          className="rounded-full bg-indigo-500 px-3 py-1 text-xs text-white shadow-sm transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          Send
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-xs text-slate-400">Loading tags...</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-slate-400">No tags yet. Add one below.</p>
        ) : (
          entries.map(([category, labels]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-slate-500">
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
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                          : "border-slate-200 text-slate-500 hover:border-indigo-200"
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

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-500">Add new tag</p>
        <div className="mt-2 flex gap-2">
          <input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="Category"
            className="w-1/2 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Label"
            className="w-1/2 rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
        >
          Add tag
        </button>
      </div>
    </div>
  );
}
