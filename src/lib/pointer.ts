/**
 * Window-wide normalised pointer position (-1..1), readable inside useFrame.
 * Canvas pointer events don't fire when DOM content sits on top of the canvas,
 * so the avatars track the pointer through this instead.
 */
export const pointer = { x: 0, y: 0, active: false };

let installed = false;

export function installPointerTracking() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointer.active = true;
    },
    { passive: true },
  );
  document.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
}
