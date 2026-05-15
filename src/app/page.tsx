import { MapView } from "@/components/map/MapView";

export default function Home() {
  return (
    <div className="relative flex h-dvh w-full flex-col">
      <header className="absolute left-4 top-4 z-10 rounded-lg border bg-background/80 px-4 py-2 shadow-sm backdrop-blur">
        <h1 className="text-sm font-semibold tracking-tight">
          Mapa Interactivo Inteligente
        </h1>
        <p className="text-xs text-muted-foreground">
          Mercado inmobiliario panameño
        </p>
      </header>
      <MapView className="h-full w-full" />
    </div>
  );
}
