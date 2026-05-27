"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { Propiedad } from "@/features/propiedades/types";

export const MAX_COMPARACION = 3;
export const MIN_COMPARACION = 2;

type ComparisonContextValue = {
  items: Propiedad[];
  isOpen: boolean;
  add: (p: Propiedad) => void;
  remove: (id: string) => void;
  toggle: (p: Propiedad) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
  has: (id: string) => boolean;
  canCompare: boolean;
  isFull: boolean;
};

const Ctx = createContext<ComparisonContextValue | null>(null);

export function ComparisonProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Propiedad[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const add = useCallback((p: Propiedad) => {
    setItems((prev) => {
      if (prev.some((x) => x.id === p.id)) return prev;
      if (prev.length >= MAX_COMPARACION) return prev;
      return [...prev, p];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const toggle = useCallback((p: Propiedad) => {
    setItems((prev) =>
      prev.some((x) => x.id === p.id)
        ? prev.filter((x) => x.id !== p.id)
        : prev.length >= MAX_COMPARACION
          ? prev
          : [...prev, p],
    );
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setIsOpen(false);
  }, []);

  const value = useMemo<ComparisonContextValue>(
    () => ({
      items,
      isOpen,
      add,
      remove,
      toggle,
      clear,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      has: (id) => items.some((p) => p.id === id),
      canCompare: items.length >= MIN_COMPARACION,
      isFull: items.length >= MAX_COMPARACION,
    }),
    [items, isOpen, add, remove, toggle, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useComparison() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useComparison must be used inside ComparisonProvider");
  return ctx;
}
