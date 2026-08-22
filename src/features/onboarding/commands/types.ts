export type Learner = { displayName: string };
export type OnboardingCommandClient = {
  getLearner(): Promise<Learner | null>;
  completeOnboarding(request: { displayName: string }): Promise<Learner>;
};
