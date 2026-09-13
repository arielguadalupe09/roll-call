"use client";

import Button from "@/app/_components/button";

export default function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      Print / save as PDF
    </Button>
  );
}
