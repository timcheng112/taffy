import type { Learner, OnboardingCommandClient } from "./types";

export function fakeOnboardingCommandClient(
  initialLearner: Learner | null = null,
): OnboardingCommandClient {
  let learner = initialLearner;
  return {
    getLearner: async () => learner,
    completeOnboarding: async ({ displayName }) => {
      learner = { displayName: displayName.trim() };
      return learner;
    },
  };
}
