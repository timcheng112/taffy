import { QueryClientProvider } from "@tanstack/react-query";
import { LibraryCommandClientProvider } from "../features/library";
import { tauriLibraryCommandClient } from "../features/library/commands/tauriLibraryCommandClient";
import { OnboardingCommandClientProvider } from "../features/onboarding";
import { tauriOnboardingCommandClient } from "../features/onboarding/commands/tauriOnboardingCommandClient";
import { queryClient } from "./queryClient";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingCommandClientProvider client={tauriOnboardingCommandClient}>
        <LibraryCommandClientProvider client={tauriLibraryCommandClient}>
          {children}
        </LibraryCommandClientProvider>
      </OnboardingCommandClientProvider>
    </QueryClientProvider>
  );
}
