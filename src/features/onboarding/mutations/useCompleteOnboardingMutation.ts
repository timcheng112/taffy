import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOnboardingCommandClient } from "../commands/OnboardingCommandClientProvider";
import type { Learner } from "../commands/types";
import { onboardingQueryKeys } from "../queries/queryKeys";

export function useCompleteOnboardingMutation() {
  const client = useOnboardingCommandClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { displayName: string }) => client.completeOnboarding(request),
    onSuccess: (learner: Learner) => {
      queryClient.setQueryData(onboardingQueryKeys.learner(), learner);
    },
  });
}
