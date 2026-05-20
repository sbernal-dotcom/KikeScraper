"use client";

import { useState } from "react";

import { MapView } from "@/components/map/MapView";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDict } from "@/i18n/LocaleProvider";
import { PropertyCard } from "@/features/propiedades/components/PropertyCard";
import { mockPropiedades } from "@/features/propiedades/mock";
import type { Propiedad } from "@/features/propiedades/types";

export default function Home() {
  const dict = useDict();
  const [seleccionada, setSeleccionada] = useState<Propiedad | null>(null);

  return (
    <>
      <SidebarTrigger
        aria-label={dict.nav.open_nav}
        className="absolute left-3 top-3 z-20 size-9 rounded-md border bg-background/80 shadow-sm backdrop-blur hover:bg-background"
      />
      <MapView
        className="h-full w-full"
        propiedades={mockPropiedades}
        selectedId={seleccionada?.id ?? null}
        onSelect={setSeleccionada}
        rightInsetPx={seleccionada ? 380 : 0}
      />
      {seleccionada ? (
        <div className="absolute inset-y-0 right-0 z-20 flex">
          <PropertyCard
            propiedad={seleccionada}
            onClose={() => setSeleccionada(null)}
          />
        </div>
      ) : null}
    </>
  );
}
