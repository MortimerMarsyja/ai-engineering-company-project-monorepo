import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export interface BackLinkProps {
  href: string;
  children?: React.ReactNode;
}

export default function BackLink({ href, children = "Back" }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="mb-6 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-[#221810]/70 outline-none hover:text-brasa-red focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {children}
    </Link>
  );
}
