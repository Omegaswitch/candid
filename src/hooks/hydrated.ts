"use client";

import { useSyncExternalStore } from "react";

const subscribeNone = () => () => {};

/**
 * False in the server render and during hydration, true afterwards. Data that was not part of the
 * server render (a query the layout did not seed) can already sit in the cache when a page hydrates,
 * because parts of the shell hydrate first and start the same fetches; gate on this so the first
 * client render matches the server HTML.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNone,
    () => true,
    () => false,
  );
}
