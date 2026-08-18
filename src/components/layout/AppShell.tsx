"use client";

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnalyticsFiltersProvider } from "@/features/propiedades/AnalyticsFiltersContext";
import { ComparisonProvider } from "@/features/comparacion/ComparisonContext";
import { MapModeProvider } from "@/features/map/MapModeProvider";

import { AppSidebar } from "./AppSidebar";

// AppShell monta los providers específicos del app (mapa + secciones). El
// LocaleProvider NO vive acá — es global y se monta en `src/app/layout.tsx`
// para que el landing (fuera del route group (app)) también pueda usar
// `useDict()`.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MapModeProvider>
      <AnalyticsFiltersProvider>
        <ComparisonProvider>
          <TooltipProvider delay={200}>
            <SidebarProvider defaultOpen>
              <AppSidebar />
              <SidebarInset className="relative h-dvh overflow-hidden">
                {children}
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        </ComparisonProvider>
      </AnalyticsFiltersProvider>
    </MapModeProvider>
  );
}
