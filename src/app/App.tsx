import { useQuery } from "@tanstack/react-query";
import { EmptyLibraryPage } from "../pages/EmptyLibraryPage";
import {
  OnboardingPage,
  useOnboardingCommandClient,
} from "../features/onboarding";
import { queryClient } from "./queryClient";

export function App() {
  const client = useOnboardingCommandClient();
  const learnerQuery = useQuery({
    queryKey: ["onboarding", "learner"],
    queryFn: () => client.getLearner(),
  });
  if (learnerQuery.isPending)
    return <main className="startup">Opening your library…</main>;
  if (learnerQuery.isError)
    return (
      <main className="startup startup-error">
        Taffy could not open your local library. Restart taffy and try again.
      </main>
    );
  if (learnerQuery.data === null)
    return (
      <OnboardingPage
        onCompleted={(learner) =>
          queryClient.setQueryData(["onboarding", "learner"], learner)
        }
      />
    );
  return <EmptyLibraryPage />;
}
