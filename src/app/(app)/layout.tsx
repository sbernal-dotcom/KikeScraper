import { AppShell } from "@/components/layout/AppShell";

// Layout del route group (app): monta el AppShell (sidebar + providers)
// para todas las páginas de la aplicación real (mapa + 4 secciones). El
// landing en `/` vive fuera de este grupo y usa un shell distinto (sin
// sidebar, con header horizontal).
export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
