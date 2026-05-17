import { AppSidebar } from "@/components/layout/AppSidebar";
import { MapView } from "@/components/map/MapView";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Home() {
  return (
    <TooltipProvider delay={200}>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset className="relative h-dvh overflow-hidden">
          <SidebarTrigger
            aria-label="Abrir navegación"
            className="absolute left-3 top-3 z-20 size-9 rounded-md border bg-background/80 shadow-sm backdrop-blur hover:bg-background"
          />
          <MapView className="h-full w-full" />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
