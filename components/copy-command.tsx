"use client";

import { useState } from "react";

/** A command or hash with a copy button. The text stays selectable without JS. */
export function CopyCommand({ text, label = "Copy", mono = true }: { text: string; label?: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-rule bg-paper">
      <code className={`min-w-0 flex-1 overflow-x-auto px-3 py-2.5 text-[13px] leading-6 whitespace-nowrap text-ink ${mono ? "font-mono" : ""}`}>{text}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          });
        }}
        className="min-h-11 min-w-16 shrink-0 border-l border-rule px-3 text-[13px] font-medium text-ink hover:bg-wash"
        aria-label={`${label}: ${text}`}
      >
        <span aria-live="polite">{done ? "Copied" : label}</span>
      </button>
    </div>
  );
}
