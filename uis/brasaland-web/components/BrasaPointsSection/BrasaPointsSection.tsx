import RegistrationForm from "../RegistrationForm";

const BENEFITS = [
  "Earn points with every visit.",
  "1 point for every $10,000 COP or $5 USD.",
  "Redeem points for discounts and free dishes.",
  "Exclusive offers for members.",
  "100% digital registration — no paper cards.",
] as const;

export default function BrasaPointsSection() {
  return (
    <section
      id="brasa-points"
      aria-labelledby="points-heading"
      className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20"
    >
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        {/* Info card — dark panel to match the Hero/Locations rhythm
            instead of a plain cream card, so this section reads as one
            visual beat instead of another bordered-card repeat. */}
        <div className="rounded-3xl bg-brasa-brown-dark p-8 text-brasa-cream shadow-lg">
          <h2
            id="points-heading"
            className="font-oswald text-3xl uppercase sm:text-4xl"
          >
            Brasa Points
          </h2>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-brasa-cream/90">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brasa-gold"
                />
                {benefit}
              </li>
            ))}
          </ul>
          <p className="mt-8 rounded-xl border border-brasa-gold/30 bg-brasa-brown-mid p-4 text-sm font-medium text-brasa-gold">
            Want to place an order? Call your favorite location or visit us
            directly. Online ordering coming soon!
          </p>
        </div>

        {/* Registration form */}
        <RegistrationForm />
      </div>
    </section>
  );
}
