import { useState } from "react";
import { HomePage } from "../features/home/components/HomePage";
import { OnboardingPage } from "../features/onboarding/components/OnboardingPage";
import { useLearnerQuery } from "../features/onboarding/queries/useLearnerQuery";
import { LibraryComposer } from "../features/library/components/LibraryComposer";
import { AppShell } from "./AppShell";
import type { AppDestination } from "./AppShell";
import { ReviewSessionPage } from "../features/review-queue/components/ReviewSessionPage";

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
  const [sessionLearningItemId, setSessionLearningItemId] = useState<number | null>(null);
  const [focusHomeQueue, setFocusHomeQueue] = useState(false);
  if (sessionLearningItemId !== null) {
    return (
      <ReviewSessionPage
        learningItemId={sessionLearningItemId}
        onAbandon={() => setSessionLearningItemId(null)}
        onCompleted={() => {
          setSessionLearningItemId(null);
          setFocusHomeQueue(true);
        }}
      />
    );
  }
  return (
    <AppShell activeDestination={destination} onNavigate={setDestination}>
      {destination === "home" ? (
        <HomePage
          displayName={displayName}
          onStartReview={(id) => {
            setFocusHomeQueue(false);
            setSessionLearningItemId(id);
          }}
          focusQueueOnMount={focusHomeQueue}
        />
      ) : (
        <LibraryComposer />
      )}
    </AppShell>
  );
}
