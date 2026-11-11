const COUNTRIES = [
  {
    name: "Colombia",
    detail: "10 restaurants in Medellin, Bogota and Cali",
  },
  {
    name: "United States (Florida)",
    detail: "4 restaurants in Miami and Orlando",
  },
] as const;

export default function LocationsSection() {
  return (
    <section
      id="locations"
      aria-labelledby="locations-heading"
      className="bg-brasa-brown-dark text-brasa-cream"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h2
          id="locations-heading"
          className="font-oswald text-3xl uppercase sm:text-4xl"
        >
          Our Locations
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-[1.4fr_1fr]">
          {COUNTRIES.map(({ name, detail }) => (
            <article
              key={name}
              className="rounded-2xl bg-brasa-brown-mid p-6 sm:p-8"
            >
              <h3 className="font-oswald text-2xl uppercase text-brasa-gold sm:text-3xl">
                {name}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-brasa-gold/80">
                {detail}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm font-semibold text-brasa-cream/70">
          Open Mon–Sun, 11:00 AM – 10:00 PM, at every location.
        </p>
      </div>
    </section>
  );
}
