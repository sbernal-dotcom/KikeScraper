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
import { useDict } from "@/i18n/LocaleProvider";

import { LanguageToggle } from "./LanguageToggle";

type NavItem = {
  key: "map" | "properties" | "sources" | "analysis" | "about";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

const primaryNav: NavItem[] = [
  { key: "map", href: "/", icon: MapIcon },
  { key: "properties", href: "/propiedades", icon: Building2 },
  { key: "sources", href: "/fuentes", icon: Globe2, comingSoon: true },
  { key: "analysis", href: "/analisis", icon: TrendingUp, comingSoon: true },
];

const secondaryNav: NavItem[] = [
  { key: "about", href: "/acerca", icon: Info, comingSoon: true },
];

export function AppSidebar() {
  const pathname = usePathname();
  const dict = useDict();

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="border-b">
        <div className="px-2 py-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {dict.brand.name}
          </h2>
          <p className="text-xs text-muted-foreground">{dict.brand.tagline}</p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{dict.nav.section}</SidebarGroupLabel>
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
          <SidebarGroupLabel>{dict.nav.section_project}</SidebarGroupLabel>
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
        <LanguageToggle />
        <div className="px-2 pb-2 text-[10px] text-muted-foreground">
          {dict.brand.version}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavMenuItem({ item, active }: { item: NavItem; active: boolean }) {
  const dict = useDict();
  const Icon = item.icon;
  const label = dict.nav[item.key];

  if (item.comingSoon) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          disabled
          tooltip={`${label} — ${dict.nav.soon}`}
          className="cursor-not-allowed opacity-60"
        >
          <Icon className="size-4" />
          <span>{label}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge>{dict.nav.soon}</SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={active}
        tooltip={label}
      >
        <Icon className="size-4" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
