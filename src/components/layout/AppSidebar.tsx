"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Globe2,
  Info,
  Map as MapIcon,
  TrendingUp,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

const primaryNav: NavItem[] = [
  { title: "Mapa", href: "/", icon: MapIcon },
  { title: "Propiedades", href: "/propiedades", icon: Building2, comingSoon: true },
  { title: "Fuentes", href: "/fuentes", icon: Globe2, comingSoon: true },
  { title: "Análisis", href: "/analisis", icon: TrendingUp, comingSoon: true },
];

const secondaryNav: NavItem[] = [
  { title: "Acerca de", href: "/acerca", icon: Info, comingSoon: true },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="border-b">
        <div className="px-2 py-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Mapa Interactivo
          </h2>
          <p className="text-xs text-muted-foreground">Inmobiliario Panamá</p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => (
                <NavMenuItem
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Proyecto</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <NavMenuItem
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="px-2 py-2 text-[10px] text-muted-foreground">
          v0.1.0 · alpha
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavMenuItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  if (item.comingSoon) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          disabled
          tooltip={`${item.title} — pronto`}
          className="cursor-not-allowed opacity-60"
        >
          <Icon className="size-4" />
          <span>{item.title}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge>Pronto</SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={active}
        tooltip={item.title}
      >
        <Icon className="size-4" />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
