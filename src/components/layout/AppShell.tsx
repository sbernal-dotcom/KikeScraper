"use client";

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppSidebar } from "./AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delay={200}>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset className="relative h-dvh overflow-hidden">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
