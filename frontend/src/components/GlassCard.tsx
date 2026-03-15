import type { PropsWithChildren } from "react";
import clsx from "clsx";

interface GlassCardProps extends PropsWithChildren {
  className?: string;
}

export const GlassCard = ({ className, children }: GlassCardProps) => (
  <section
    className={clsx(
      "rounded-2xl border border-[#a9cbb5] bg-[#cfe7d6] p-4 shadow-[0_6px_20px_rgba(18,33,18,0.08)]",
      className
    )}
  >
    {children}
  </section>
);
