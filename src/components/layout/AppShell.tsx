"use client";

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { AnalyticsFiltersProvider } from "@/features/propiedades/AnalyticsFiltersContext";
import { ComparisonProvider } from "@/features/comparacion/ComparisonContext";

import { AppSidebar } from "./AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
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
    </LocaleProvider>
  );
}
