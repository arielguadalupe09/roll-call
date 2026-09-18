"use client";

import Button from "@/app/_components/button";

export default function PrintButton() {
  return (
    <Button variant="highlight" size="sm" onClick={() => window.print()}>
      Print / save as PDF
    </Button>
  );
}
