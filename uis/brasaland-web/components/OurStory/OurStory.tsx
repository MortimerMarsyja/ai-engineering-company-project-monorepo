import Image from "next/image";
import { STOCK_PHOTOS, unsplashUrl } from "@/lib/stock-photos";

export default function OurStory() {
  return (
    <section
      aria-labelledby="story-heading"
      className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1.1fr] md:py-20"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-3xl shadow-xl md:aspect-5/4">
        <Image
          src={unsplashUrl(STOCK_PHOTOS.ourStoryGrilledMeats, 1000)}
          alt="Grilled meats served on a wooden table"
          fill
          loading="lazy"
          sizes="(min-width: 768px) 42vw, 100vw"
          className="object-cover"
        />
      </div>
      <div>
        <h2
          id="story-heading"
          className="font-oswald text-3xl uppercase text-brasa-brown sm:text-4xl"
        >
          Our Story
        </h2>
        <p className="mt-5 text-base leading-relaxed text-brasa-text-secondary">
          Founded in Medellin in 2008, Brasaland began as a family dream:
          sharing the authentic taste of grilled meat with consistent quality
          and warm service. Today we are 14 restaurants in two countries, but
          we maintain the same recipe for success: fresh products, traditional
          techniques, and passion for every dish we serve.
        </p>

        {/* What makes us unique — inline list instead of 3 repeated cards,
            reducing card/shadow repetition per this refresh's direction. */}
        <dl className="mt-8 space-y-5 border-t border-brasa-brown/10 pt-6">
          {FEATURES.map(({ title, items }) => (
            <div key={title}>
              <dt className="font-oswald text-lg uppercase text-brasa-red">
                {title}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-brasa-text-secondary">
                {items.join(" ")}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: "Consistent Quality",
    items: [
      "Same recipes and standards in all locations.",
      "Fresh ingredients selected daily.",
    ],
  },
  {
    title: "Warm Experience",
    items: [
      "Friendly and attentive service.",
      "Family atmosphere on every visit.",
    ],
  },
  {
    title: "Speed",
    items: [
      "Your food ready in minutes.",
      "Without sacrificing flavor or quality.",
    ],
  },
] as const;
