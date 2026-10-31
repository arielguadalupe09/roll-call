"use client";

import { useSyncExternalStore } from "react";

// The browser's current time, ticking every second -- or null during SSR.
// Vercel's servers run in UTC while teachers are in UTC+8, so a clock (or
// anything derived from "now") rendered on the server shows a time 8 hours
// off; with suppressHydrationWarning React then kept that server text until
// the rendered string next changed, which for a minutes-only clock meant up
// to a full minute of the wrong time. Never rendering "now" on the server
// avoids the mismatch entirely.
function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1_000);
  return () => clearInterval(id);
}

// Rounded to the second so the snapshot is stable between ticks, as
// useSyncExternalStore requires.
const getNow = () => Math.floor(Date.now() / 1_000) * 1_000;
const getServerNow = () => null;

export function useNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, getNow, getServerNow);
  return ms === null ? null : new Date(ms);
}
