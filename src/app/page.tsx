"use client";

import { useState } from "react";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { MapView } from "@/components/map/MapView";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PropertyCard } from "@/features/propiedades/components/PropertyCard";
import { mockPropiedades } from "@/features/propiedades/mock";
import type { Propiedad } from "@/features/propiedades/types";

export default function Home() {
  const [seleccionada, setSeleccionada] = useState<Propiedad | null>(null);

  return (
    <TooltipProvider delay={200}>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset className="relative h-dvh overflow-hidden">
          <SidebarTrigger
            aria-label="Abrir navegación"
            className="absolute left-3 top-3 z-20 size-9 rounded-md border bg-background/80 shadow-sm backdrop-blur hover:bg-background"
          />
          <MapView
            className="h-full w-full"
            propiedades={mockPropiedades}
            selectedId={seleccionada?.id ?? null}
            onSelect={setSeleccionada}
          />
          {seleccionada ? (
            <div className="absolute inset-y-0 right-0 z-20 flex">
              <PropertyCard
                propiedad={seleccionada}
                onClose={() => setSeleccionada(null)}
              />
            </div>
          ) : null}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
