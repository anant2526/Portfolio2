import { useSyncExternalStore } from "react";

/** Tiny global flag so hero animations start right as the boot loader leaves. */
let booted = false;
const subscribers = new Set<() => void>();

export function markBooted() {
  if (booted) return;
  booted = true;
  for (const s of subscribers) s();
}

export function useBooted() {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => booted,
    () => false,
  );
}
