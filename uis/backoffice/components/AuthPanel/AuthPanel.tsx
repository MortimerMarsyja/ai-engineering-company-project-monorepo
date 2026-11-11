import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/Logo";

interface AuthPanelProps {
  title: string;
  description: string;
  alternateText: string;
  alternateLabel: string;
  alternateHref: string;
  children: ReactNode;
}

// Pre-existing photo reference, not a new asset: the exact same Unsplash
// URL already used by uis/brasaland-web (OurStory section + its page
// metadata) — reused here, not fabricated for this redesign. Unsplash
// License (free to use, no attribution required). Replace with real
// Brasaland kitchen/grill photography before shipping either app.
const BRAND_PHOTO_URL =
  "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1200&q=80";

export default function AuthPanel({
  title,
  description,
  alternateText,
  alternateLabel,
  alternateHref,
  children,
}: AuthPanelProps) {
  return (
    <div className="flex min-h-screen bg-surface-muted">
      {/* Brand/visual panel — desktop only (lg+), per "en móvil, prioriza
          el acceso al formulario": collapsed entirely on smaller screens
          rather than shrunk into an awkward sliver. */}
      <div className="relative hidden w-[42%] shrink-0 overflow-hidden bg-brasa-brown-dark lg:block">
        <Image
          src={BRAND_PHOTO_URL}
          alt="Grilled meats served on a wooden table"
          fill
          priority
          sizes="42vw"
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-linear-to-t from-brasa-brown-dark via-brasa-brown-dark/70 to-brasa-brown-dark/30" />
        <div className="relative flex h-full flex-col justify-between p-10 text-brasa-cream">
          <Logo size="size-11" />
          <div>
            <p className="font-oswald text-3xl uppercase leading-tight">
              Operations,
              <br />
              run from one place
            </p>
            <p className="mt-3 max-w-sm text-sm text-brasa-cream/75">
              Inventory, incidents, suppliers, and Brasa Points across every
              Brasaland location — Colombia and the United States.
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:px-16">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <Link
            href="/login"
            className="flex w-fit items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2 lg:hidden"
          >
            <Logo />
            <span>
              <span className="block text-sm font-bold text-[#221810]">Brasaland</span>
              <span className="block text-xs text-[#221810]/55">Backoffice</span>
            </span>
          </Link>

          <header>
            <h1 className="font-oswald text-2xl font-semibold text-[#221810]">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[#221810]/60">{description}</p>
          </header>

          {children}

          <p className="border-t border-admin-border pt-5 text-center text-sm text-[#221810]/60">
            {alternateText}{" "}
            <Link
              href={alternateHref}
              className="rounded-sm font-semibold text-brasa-red outline-none hover:text-brasa-red-dark hover:underline focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2"
            >
              {alternateLabel}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
