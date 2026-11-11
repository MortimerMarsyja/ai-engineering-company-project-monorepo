/**
 * Compact brand-proof strip — "since 2008 / 14 restaurants / Colombia &
 * the US", the only facts already established elsewhere on this page
 * (Hero, OurStory). No invented numbers, awards, or testimonials.
 */
const STATS = [
  { value: "2008", label: "Founded" },
  { value: "14", label: "Restaurants" },
  { value: "2", label: "Countries" },
] as const;

export default function BrandProof() {
  return (
    <section aria-label="Brasaland at a glance" className="border-y border-brasa-brown/10 bg-brasa-cream-light">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-6 sm:px-6 sm:py-7">
        {STATS.map(({ value, label }, index) => (
          <div key={label} className="flex items-center gap-x-10">
            <p className="flex items-baseline gap-2">
              <span className="font-oswald text-3xl text-brasa-red sm:text-4xl">
                {value}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-brasa-text-secondary sm:text-sm">
                {label}
              </span>
            </p>
            {index < STATS.length - 1 && (
              <span aria-hidden="true" className="hidden h-8 w-px bg-brasa-brown/15 sm:block" />
            )}
          </div>
        ))}
        <p className="basis-full text-center text-sm text-brasa-text-secondary sm:basis-auto sm:border-l sm:border-brasa-brown/15 sm:pl-10">
          Colombia &amp; the United States
        </p>
      </div>
    </section>
  );
}
