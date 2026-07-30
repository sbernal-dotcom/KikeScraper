"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Cog,
  History,
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
import { usePreviewMeta } from "@/features/propiedades/preview";
import { useDict } from "@/i18n/LocaleProvider";

import { LanguageToggle } from "./LanguageToggle";
import { LastScrapeBadge } from "./LastScrapeBadge";
import { MapModeToggle } from "./MapModeToggle";

type NavItem = {
  key: "map" | "properties" | "analysis" | "history" | "scraper";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

const primaryNav: NavItem[] = [
  { key: "map", href: "/", icon: MapIcon },
  { key: "properties", href: "/propiedades", icon: Building2 },
  { key: "analysis", href: "/analisis", icon: TrendingUp },
  { key: "history", href: "/historial", icon: History },
  { key: "scraper", href: "/scraper", icon: Cog },
];

export function AppSidebar() {
  const pathname = usePathname();
  const dict = useDict();
  const preview = usePreviewMeta();

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="border-b">
        <div className="px-2 py-2">
          <h2 className="text-xs font-semibold leading-tight tracking-tight">
            {dict.brand.name}
          </h2>
          <p className="text-[10px] leading-tight text-muted-foreground">
            {dict.brand.tagline}
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="h-6 text-[10px]">
            {dict.nav.section}
          </SidebarGroupLabel>
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

        {preview.enabled && preview.count > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel className="h-6 text-[10px]">
              {dict.nav.section_project}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div
                className="mx-2 mt-2 rounded-md border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: "rgba(214,255,0,0.12)",
                  color: "#D6FF00",
                  borderColor: "rgba(214,255,0,0.4)",
                }}
                title="Mostrando anuncios scrapeados desde public/scrape-preview.json (no guardados en DB)"
              >
                Preview · {preview.count} scrapeados
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <LastScrapeBadge />
        <MapModeToggle />
        <LanguageToggle />
        <div className="space-y-0.5 px-2 pb-2 text-[10px] text-muted-foreground">
          <div>{dict.brand.version}</div>
          <div>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {dict.brand.attribution}
            </a>
          </div>
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
          size="sm"
          disabled
          tooltip={`${label} — ${dict.nav.soon}`}
          className="cursor-not-allowed opacity-60"
        >
          <Icon className="size-3.5" />
          <span>{label}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge className="text-[9px]">
          {dict.nav.soon}
        </SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="sm"
        render={<Link href={item.href} />}
        isActive={active}
        tooltip={label}
      >
        <Icon className="size-3.5" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
