"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];

/** Manual theme toggle (footer). Stored in localStorage; "system" follows prefers-color-scheme. */
export function ThemeToggle() {
  const [t, setT] = useState<Theme>("system");
  useEffect(() => {
    const v = localStorage.getItem("prix-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the stored choice once after hydration
    if (v === "light" || v === "dark") setT(v);
  }, []);
  const next = () => {
    const n = ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];
    setT(n);
    if (n === "system") {
      localStorage.removeItem("prix-theme");
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem("prix-theme", n);
      document.documentElement.setAttribute("data-theme", n);
    }
  };
  return (
    <button type="button" onClick={next} className="inline-flex min-h-11 items-center rounded-lg border border-rule px-3 text-[13px] text-ink hover:bg-wash" aria-label={`Theme: ${t}. Change theme`}>
      Theme: {t === "system" ? "system" : t}
    </button>
  );
}

/** Inline, render-blocking script so the stored theme applies before first paint (no flash). */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("prix-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
