import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

// L9: antes usábamos `useState<boolean|undefined>` inicializado en undefined
// y updateábamos en useEffect. Consecuencia: el primer render en cliente
// devolvía `false` (undefined es falsy) → un frame de UI-desktop antes de
// corregirse a mobile → flash visible al cargar en el celular.
//
// `useSyncExternalStore` lee el valor síncronamente al render:
//   - En cliente: getSnapshot devuelve el ancho real.
//   - En SSR: getServerSnapshot devuelve false por default (elección
//     conservadora, mismo comportamiento visual que antes durante hidration).

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
