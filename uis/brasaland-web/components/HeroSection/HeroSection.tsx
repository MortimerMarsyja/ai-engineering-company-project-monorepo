import Image from "next/image";
import { STOCK_PHOTOS, unsplashUrl } from "@/lib/stock-photos";

export default function HeroSection() {
  return (
    <section aria-labelledby="hero-heading" className="w-full">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12 md:grid-cols-[1fr_1.05fr] md:gap-10 md:py-16">
        {/* Food photo — first in document order so it's the first thing a
            screen reader / mobile viewport encounters, matching "conserva
            la presencia de la fotografía" on mobile. No lazy loading and
            `priority` on the main hero image per this refresh's explicit
            requirement (it's the LCP element). */}
        <div className="relative order-1 aspect-4/3 w-full overflow-hidden rounded-3xl shadow-2xl sm:aspect-16/11 md:order-2 md:aspect-4/5">
          <Image
            src={unsplashUrl(STOCK_PHOTOS.heroGrillSpread, 1200)}
            alt="Assorted grilled skewers, chicken, lamb chops and roasted vegetables on a wooden board"
            fill
            priority
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-brasa-brown-dark/40 via-transparent to-transparent" />
        </div>

        {/* Copy + CTAs */}
        <div className="order-2 md:order-1">
          <span className="inline-block rounded-full bg-brasa-red-deep px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-brasa-cream">
            Since 2008
          </span>
          <h1
            id="hero-heading"
            className="mt-5 font-oswald text-4xl uppercase leading-[1.05] text-brasa-brown sm:text-5xl md:text-6xl"
          >
            The taste of the grill, in every bite
          </h1>
          <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-brasa-text-secondary">
            14 locations across Colombia and the United States, one open
            flame since 2008.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#menu"
              className="rounded-full bg-brasa-red px-6 py-3 text-sm font-bold uppercase tracking-wide text-brasa-cream shadow-[0_10px_25px_rgba(109,36,20,0.3)] transition hover:-translate-y-0.5 hover:bg-brasa-red-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brasa-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              View Menu
            </a>
            <a
              href="#locations"
              className="rounded-full border-2 border-brasa-brown px-6 py-3 text-sm font-bold uppercase tracking-wide text-brasa-brown transition hover:bg-brasa-brown hover:text-brasa-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brasa-red"
            >
              Find Your Restaurant
            </a>
          </div>

          {/* Brasa Points — secondary position, per this refresh's
              direction (it was a full card before; now a quiet text link). */}
          <a
            href="#brasa-points-form"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brasa-text-secondary underline decoration-brasa-orange/50 decoration-2 underline-offset-4 transition hover:text-brasa-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brasa-red"
          >
            Join Brasa Points and start earning rewards
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </div>
    </section>
  );
}
