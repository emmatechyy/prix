"use client";

import { useEffect } from "react";

/** Deep links to a claim (/#h2) scroll to it and open its evidence panel (spec §9). */
export function HashOpener() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1)).toLowerCase();
      if (!/^h[1-6]$/.test(id)) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
