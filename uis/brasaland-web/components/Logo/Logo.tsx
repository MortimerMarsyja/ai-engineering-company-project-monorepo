interface LogoProps {
  className?: string;
  /** Tailwind `size-*` utility for the badge. Default matches the
   * landing header / backoffice sidebar; pass e.g. "size-10" for the
   * slightly larger mark used on auth screens. The flame glyph itself
   * stays a fixed size-5 regardless, matching every existing usage. */
  size?: string;
}

/**
 * Logo - Brasaland flame mark, inline SVG (no binary asset to keep in
 * sync/ship). The exact same shape, colors, and markup live in every app
 * that renders this mark (landing, backoffice, both apps' favicons) —
 * colors are hardcoded here rather than taken from each app's own
 * `--color-brasa-red` token, since those tokens have drifted slightly
 * between apps and the logo itself must look identical everywhere
 * regardless of that drift.
 */
export default function Logo({ className = "", size = "size-9" }: LogoProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-[#b23a21] shadow-sm ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="#f9ede0" className="size-5">
        <path d="M12 2c-.3 2-2 3.6-3.4 5.2C6.9 9 6 10.8 6 13a6 6 0 0 0 12 0c0-1.8-.6-3-1.6-4.3-.2 1.6-1 2.6-1.9 3.1.3-2.2-.4-4-1.7-5.4C13.6 5.2 12.6 3.8 12 2Z" />
      </svg>
    </span>
  );
}
