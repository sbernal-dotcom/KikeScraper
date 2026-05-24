import { Suspense } from "react";

import { HomeContent } from "./home-content";

// Página server-side. Suspense en este nivel es lo que Next.js recomienda
// cuando un client component descendiente usa useSearchParams, para que el
// prerender pueda continuar sin esperar al cliente.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
