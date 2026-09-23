"use client";

import { useEffect, useState } from "react";

/** 订阅一个 CSS 媒体查询，返回当前是否命中 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** 是否处于移动端（与 Tailwind lg 断点对应：宽度 < 1024px） */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
