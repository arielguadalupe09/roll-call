"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

function Bar({ className = "" }: { className?: string }) {
  return <div data-animate="pulse" className={`rounded-full bg-ink/10 ${className}`} />;
}

function TileSkeleton() {
  return (
    <div className="rounded-2xl border border-rule/40 bg-white p-4">
      <div className="flex items-center justify-between">
        <Bar className="h-2.5 w-16" />
        <div data-animate="pulse" className="h-8 w-8 shrink-0 rounded-full bg-ink/10" />
      </div>
      <Bar className="mt-3 h-7 w-12" />
      <Bar className="mt-3 h-1.5 w-full" />
    </div>
  );
}

export default function DashboardLoading() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mm = gsap.matchMedia(rootRef);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.to("[data-animate='pulse']", {
        opacity: 0.35,
        duration: 0.7,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: { each: 0.05, from: "start" },
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <div ref={rootRef} className="px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <Bar className="h-2.5 w-20" />
        <Bar className="mt-3 h-8 w-56" />
        <Bar className="mt-3 h-4 w-80" />

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TileSkeleton />
          <TileSkeleton />
          <TileSkeleton />
          <TileSkeleton />
        </div>

        <div className="mt-6 rounded-2xl border border-t-2 border-rule/40 border-t-brass bg-white p-5">
          <Bar className="h-5 w-44" />
          <Bar className="mt-2 h-3.5 w-64" />
          <div className="mt-5 flex flex-col gap-3">
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-11/12" />
            <Bar className="h-3 w-4/5" />
            <Bar className="h-3 w-2/3" />
            <Bar className="h-3 w-3/4" />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
          <Bar className="h-5 w-24" />
          <div className="mt-4 flex flex-col gap-2.5">
            <Bar className="h-3 w-3/4" />
            <Bar className="h-3 w-2/3" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );
}
