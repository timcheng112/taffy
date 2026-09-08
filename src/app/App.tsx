import { OnboardingPage } from "../features/onboarding/components/OnboardingPage";
import { useLearnerQuery } from "../features/onboarding/queries/useLearnerQuery";
import { LibraryComposer } from "../features/library/components/LibraryComposer";
import { AppShell } from "./AppShell";

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
  return (
    <AppShell>
      <LibraryComposer />
    </AppShell>
  );
}
