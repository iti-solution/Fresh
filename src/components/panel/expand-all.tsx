"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Zwija / rozwija wszystkie listy punktów trasy na ekranie (elementy `<details data-stops>`). */
export function ExpandAll({ selector = "details[data-stops]" }: { selector?: string }) {
  const set = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>(selector).forEach((d) => (d.open = open));
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Trasy">
      <button type="button" onClick={() => set(true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ChevronsUpDown /> Rozwiń trasy
      </button>
      <button type="button" onClick={() => set(false)} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ChevronsDownUp /> Zwiń trasy
      </button>
    </div>
  );
}
