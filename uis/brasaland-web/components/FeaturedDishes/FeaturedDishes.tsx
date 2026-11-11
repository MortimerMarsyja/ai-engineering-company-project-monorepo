import Image from "next/image";
import { STOCK_PHOTOS, unsplashUrl } from "@/lib/stock-photos";

/**
 * Real existing data — NOT invented. Names, cities, and prices come
 * verbatim from `services/api/seed_inventory.py`'s `SEED_PRODUCTS` (the
 * `MenuItem` seed fixture: "a dish on the Brasaland menu, scoped to a
 * country/city"). This page has no live connection to that backend (it's
 * a fully static marketing site — see lib/ for the only other data this
 * app uses), so the values are copied here rather than fetched; if the
 * backend's seed data ever changes, update this list to match.
 *
 * Photography for all three is licensed stock (see ../../IMAGE_CREDITS.md)
 * — not real photos of these dishes. Swap `photo` for a real photo of the
 * actual churrasco served at that location before shipping.
 */
const DISHES = [
  {
    name: "Churrasco Brasaland",
    city: "Medellín, Colombia",
    priceCop: 45000,
    photo: STOCK_PHOTOS.churrascoMedellin,
    alt: "Grilled bone-in steak with red wine jus and broccolini",
  },
  {
    name: "Churrasco Brasaland",
    city: "Bogotá, Colombia",
    priceCop: 48000,
    photo: STOCK_PHOTOS.churrascoBogota,
    alt: "Grilled ribs plate with fries, pickles, tomato and BBQ sauce",
  },
  {
    name: "Brasaland Churrasco",
    city: "Miami, United States",
    priceUsd: 13.0,
    photo: STOCK_PHOTOS.churrascoMiami,
    alt: "Close-up of a fork and knife cutting into a grilled, sliced steak",
  },
] as const;

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function FeaturedDishes() {
  return (
    <section
      id="menu"
      aria-labelledby="dishes-heading"
      className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20"
    >
      <div className="max-w-2xl">
        <h2 id="dishes-heading" className="font-oswald text-3xl uppercase text-brasa-brown sm:text-4xl">
          Our Signature Churrasco
        </h2>
        <p className="mt-4 text-base leading-relaxed text-brasa-text-secondary">
          The same beloved cut, grilled fresh at every Brasaland — pricing
          reflects each location&apos;s local currency.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {DISHES.map((dish, index) => (
          <article
            key={`${dish.name}-${dish.city}`}
            className="group relative overflow-hidden rounded-3xl bg-brasa-brown-dark text-brasa-cream shadow-lg"
          >
            <div className="relative aspect-4/5 w-full">
              <Image
                src={unsplashUrl(dish.photo, 800)}
                alt={dish.alt}
                fill
                loading={index === 0 ? "eager" : "lazy"}
                sizes="(min-width: 768px) 33vw, 100vw"
                className="object-cover transition duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div className="absolute inset-0 bg-linear-to-t from-brasa-brown-dark via-brasa-brown-dark/10 to-transparent" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brasa-gold">
                {dish.city}
              </p>
              <h3 className="mt-1 font-oswald text-xl uppercase leading-tight">
                {dish.name}
              </h3>
              <p className="mt-2 font-oswald text-lg text-brasa-gold">
                {"priceCop" in dish ? copFormatter.format(dish.priceCop) : usdFormatter.format(dish.priceUsd)}
              </p>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-6 text-sm text-brasa-text-secondary">
        Full menu available in-restaurant. Online ordering coming soon.
      </p>
    </section>
  );
}
