import { invoke } from "@tauri-apps/api/core";
import type { Learner, OnboardingCommandClient } from "./types";

export const tauriOnboardingCommandClient: OnboardingCommandClient = {
  getLearner: () => invoke<Learner | null>("get_learner"),
  completeOnboarding: (request) => invoke<Learner>("complete_onboarding", { request }),
};
