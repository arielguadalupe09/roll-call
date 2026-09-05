"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";

export default function DashboardLoading() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mm = gsap.matchMedia(rootRef);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.to("[data-animate='spin']", {
        rotate: 360,
        duration: 1.4,
        ease: "none",
        repeat: -1,
        transformOrigin: "50% 50%",
      });
      gsap.to("[data-animate='breathe']", {
        scale: 1.1,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
      gsap.to("[data-animate='dots'] > *", {
        opacity: 0.2,
        y: -3,
        duration: 0.5,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.15,
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-8 py-10"
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg
          data-animate="spin"
          width="80"
          height="80"
          viewBox="0 0 80 80"
          fill="none"
          className="absolute inset-0"
          aria-hidden="true"
        >
          <circle cx="40" cy="40" r="35" stroke="var(--rule)" strokeOpacity="0.3" strokeWidth="4" />
          <circle
            cx="40"
            cy="40"
            r="35"
            stroke="var(--brass)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="55 165"
          />
        </svg>
        <div data-animate="breathe" className="relative h-10 w-10">
          <Image
            src="/logo-icon.png"
            alt="GAINS"
            width={512}
            height={512}
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brass">Loading</p>
        <p className="font-display text-lg font-semibold text-ink">Getting your dashboard ready</p>
      </div>

      <div data-animate="dots" className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
      </div>
    </div>
  );
}
