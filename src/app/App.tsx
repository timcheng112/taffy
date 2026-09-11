import { useState } from "react";
import { HomePage } from "../features/home/components/HomePage";
import { OnboardingPage } from "../features/onboarding/components/OnboardingPage";
import { useLearnerQuery } from "../features/onboarding/queries/useLearnerQuery";
import { LibraryComposer } from "../features/library/components/LibraryComposer";
import { AppShell } from "./AppShell";
import type { AppDestination } from "./AppShell";

export function App() {
  const learnerQuery = useLearnerQuery();
  if (learnerQuery.isPending) return <main className="startup">Opening your library…</main>;
  if (learnerQuery.isError)
    return (
      <main className="startup startup-error">
        Taffy could not open your local library. Restart taffy and try again.
      </main>
    );
  if (learnerQuery.data === null) return <OnboardingPage />;
  return <AuthenticatedApp displayName={learnerQuery.data.displayName} />;
}

function AuthenticatedApp({ displayName }: { displayName: string }) {
  const [destination, setDestination] = useState<AppDestination>("home");
  return (
    <AppShell activeDestination={destination} onNavigate={setDestination}>
      {destination === "home" ? <HomePage displayName={displayName} /> : <LibraryComposer />}
    </AppShell>
  );
}
