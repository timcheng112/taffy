import { useQuery } from "@tanstack/react-query";
import { useOnboardingCommandClient } from "../commands/OnboardingCommandClientProvider";
import { onboardingQueryKeys } from "./queryKeys";

export function useLearnerQuery() {
  const client = useOnboardingCommandClient();
  return useQuery({
    queryKey: onboardingQueryKeys.learner(),
    queryFn: () => client.getLearner(),
  });
}
