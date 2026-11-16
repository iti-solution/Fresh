import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDayLabel, shiftDay } from "@/modules/orders/domain/orders";

/**
 * Jedyny wybór dnia w całej aplikacji: ‹ Dziś, 16.11 ›. Kliknięcie środka wraca do dzisiaj.
 * `href(day)` buduje adres zachowując pozostałe filtry ekranu.
 */
export function DayNav({ day, today, href }: { day: string; today: string; href: (day: string) => string }) {
  const isToday = day === today;
  return (
    <div className="flex items-center gap-1">
      <Link href={href(shiftDay(day, -1))} aria-label="Poprzedni dzień" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ChevronLeft />
      </Link>
      <Link
        href={href(today)}
        aria-label="Wróć do dzisiaj"
        aria-current={isToday ? "date" : undefined}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-w-40 font-semibold capitalize", isToday && "border-primary-strong/40 bg-accent")}
      >
        {isToday ? `Dziś, ${formatDayLabel(day).split(", ")[1]}` : formatDayLabel(day)}
      </Link>
      <Link href={href(shiftDay(day, 1))} aria-label="Następny dzień" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ChevronRight />
      </Link>
    </div>
  );
}
