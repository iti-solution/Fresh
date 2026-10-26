import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground font-semibold shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)] hover:bg-[#ec5800] active:bg-primary-strong",
        outline: "border border-border-strong bg-surface text-foreground hover:border-subtle hover:bg-surface-2",
        ghost: "text-muted hover:bg-foreground/[0.05] hover:text-foreground",
        danger: "bg-danger text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)] hover:bg-danger/90",
        soft: "bg-accent text-primary-strong hover:bg-[#ffe2cf]",
      },
      size: { xs: "h-7 rounded-md px-2 text-xs", sm: "h-8 px-3 text-[13px]", md: "h-10 px-4", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
