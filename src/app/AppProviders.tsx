import { QueryClientProvider } from "@tanstack/react-query";
import { LibraryCommandClientProvider } from "../features/library/commands/LibraryCommandClientProvider";
import { tauriLibraryCommandClient } from "../features/library/commands/tauriLibraryCommandClient";
import { LearningItemsCommandClientProvider } from "../features/learning-items/commands/LearningItemsCommandClientProvider";
import { tauriLearningItemsCommandClient } from "../features/learning-items/commands/tauriLearningItemsCommandClient";
import { OnboardingCommandClientProvider } from "../features/onboarding/commands/OnboardingCommandClientProvider";
import { tauriOnboardingCommandClient } from "../features/onboarding/commands/tauriOnboardingCommandClient";
import { ReviewQueueCommandClientProvider } from "../features/review-queue/commands/ReviewQueueCommandClientProvider";
import { tauriReviewQueueCommandClient } from "../features/review-queue/commands/tauriReviewQueueCommandClient";
import { ReviewSessionCommandClientProvider } from "../features/review-queue/commands/ReviewSessionCommandClientProvider";
import { tauriReviewSessionCommandClient } from "../features/review-queue/commands/tauriReviewSessionCommandClient";
import { queryClient } from "./queryClient";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingCommandClientProvider client={tauriOnboardingCommandClient}>
        <LibraryCommandClientProvider client={tauriLibraryCommandClient}>
          <LearningItemsCommandClientProvider client={tauriLearningItemsCommandClient}>
            <ReviewQueueCommandClientProvider client={tauriReviewQueueCommandClient}>
              <ReviewSessionCommandClientProvider client={tauriReviewSessionCommandClient}>
                {children}
              </ReviewSessionCommandClientProvider>
            </ReviewQueueCommandClientProvider>
          </LearningItemsCommandClientProvider>
        </LibraryCommandClientProvider>
      </OnboardingCommandClientProvider>
    </QueryClientProvider>
  );
}
