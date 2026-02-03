export type TagGroup = {
  category: string;
  labels: string[];
};

const normalize = (groups: TagGroup[]) => {
  const map = new Map<string, Set<string>>();
  for (const group of groups) {
    const category = group.category.trim();
    if (!category) continue;
    if (!map.has(category)) {
      map.set(category, new Set());
    }
    const bucket = map.get(category);
    for (const label of group.labels) {
      const value = label.trim();
      if (value) {
        bucket?.add(value);
      }
    }
  }
  return Array.from(map.entries()).map(([category, labels]) => ({
    category,
    labels: Array.from(labels.values()),
  }));
};

export const serializeTagGroups = (groups: TagGroup[]) => {
  return JSON.stringify(normalize(groups));
};

const parseLegacyTags = (tags: string): TagGroup[] => {
  const parts = tags
    .split(/[,\\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const groups: TagGroup[] = [];

  for (const part of parts) {
    if (part.includes("##")) {
      const [category, label] = part.split("##");
      if (category && label) {
        groups.push({ category, labels: [label] });
      }
      continue;
    }

    const hashParts = part.split("#").filter(Boolean);
    if (hashParts.length >= 2) {
      const [category, label] = hashParts;
      groups.push({ category, labels: [label] });
    }
  }

  return normalize(groups);
};

export const parseTagGroups = (tags?: string | null): TagGroup[] => {
  if (!tags) return [];
  const trimmed = tags.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as TagGroup[];
    if (Array.isArray(parsed)) {
      return normalize(parsed);
    }
  } catch {
    // fall back to legacy formats
  }

  return parseLegacyTags(trimmed);
};

export const formatTagGroups = (groups: TagGroup[]) => {
  return groups
    .map((group) => `${group.category}: ${group.labels.join(", ")}`)
    .join(" · ");
};
