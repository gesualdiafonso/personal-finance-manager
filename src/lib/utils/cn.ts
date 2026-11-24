import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the Design System utilities, otherwise it cannot tell that
 * `type-body` and `type-heading` conflict.
 */
const twMerge = extendTailwindMerge<"typography">({
  extend: {
    classGroups: {
      typography: [
        {
          type: [
            "display-hero",
            "display-hero-mobile",
            "title-page",
            "title-page-mobile",
            "heading",
            "subheading",
            "body",
            "body-sm",
            "caption",
            "label",
            "nav",
            "amount-xl",
            "amount-lg",
            "amount",
            "amount-sm",
            "date-day",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
