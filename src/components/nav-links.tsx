"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links: { href: string; label: string; exact: boolean }[] = [
    { href: "/", label: "仪表盘", exact: true },
    { href: "/search", label: "搜索", exact: false },
    ...(isAdmin ? [{ href: "/admin/users", label: "用户管理", exact: true }] : []),
  ];

  return (
    <>
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap ${
              active
                ? "font-semibold text-indigo-600 dark:text-indigo-300"
                : "hover:text-indigo-600 dark:hover:text-indigo-400"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}