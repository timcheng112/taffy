import { QueryClientProvider } from "@tanstack/react-query";
import { LibraryCommandClientProvider } from "../features/library/commands/LibraryCommandClientProvider";
import { tauriLibraryCommandClient } from "../features/library/commands/tauriLibraryCommandClient";
import { LearningItemsCommandClientProvider } from "../features/learning-items/commands/LearningItemsCommandClientProvider";
import { tauriLearningItemsCommandClient } from "../features/learning-items/commands/tauriLearningItemsCommandClient";
import { OnboardingCommandClientProvider } from "../features/onboarding/commands/OnboardingCommandClientProvider";
import { tauriOnboardingCommandClient } from "../features/onboarding/commands/tauriOnboardingCommandClient";
import { queryClient } from "./queryClient";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingCommandClientProvider client={tauriOnboardingCommandClient}>
        <LibraryCommandClientProvider client={tauriLibraryCommandClient}>
          <LearningItemsCommandClientProvider client={tauriLearningItemsCommandClient}>
            {children}
          </LearningItemsCommandClientProvider>
        </LibraryCommandClientProvider>
      </OnboardingCommandClientProvider>
    </QueryClientProvider>
  );
}
