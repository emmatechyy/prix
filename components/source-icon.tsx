/** Icon-only source link with an accessible name (spec §7 SourceLink). 44px hit area. */
export function SourceIcon({ href, name }: { href: string; name: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-grid h-11 w-11 place-items-center rounded-lg text-slate hover:bg-wash hover:text-ink" aria-label={`Source for ${name}`} title={href}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </a>
  );
}
