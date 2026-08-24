import { OnboardingPage, useLearnerQuery } from "../features/onboarding";
import { LibraryPage } from "../pages/LibraryPage";

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
  return <LibraryPage />;
}
