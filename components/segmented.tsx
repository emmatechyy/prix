import Link from "next/link";

/** In-page secondary navigation as a segmented control (spec §2). State lives in the URL. */
export function SegmentedControl({ label, items, current }: { label: string; items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="scroll-x">
      <ul className="inline-flex gap-1 rounded-full bg-surface p-1">
        {items.map((i) => {
          const on = i.key === current;
          return (
            <li key={i.key}>
              <Link
                href={i.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-5 text-[15px] whitespace-nowrap transition-colors duration-300 ${on ? "bg-ink font-semibold text-paper" : "text-ink hover:bg-wash"}`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
