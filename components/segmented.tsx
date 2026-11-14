import Link from "next/link";

/** In-page secondary navigation as a segmented control (spec §2). State lives in the URL. */
export function SegmentedControl({ label, items, current }: { label: string; items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="scroll-x">
      <ul className="inline-flex rounded-lg border border-rule bg-surface p-1">
        {items.map((i) => {
          const on = i.key === current;
          return (
            <li key={i.key}>
              <Link
                href={i.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-4 text-[15px] whitespace-nowrap ${on ? "bg-ink font-semibold text-paper" : "text-ink hover:bg-wash"}`}
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
