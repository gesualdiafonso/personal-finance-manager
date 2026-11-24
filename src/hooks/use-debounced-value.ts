"use client";

import { useEffect, useState } from "react";

/** The value, updated only after `delay` ms without changes (search on typing, Step 04 §9.4). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
