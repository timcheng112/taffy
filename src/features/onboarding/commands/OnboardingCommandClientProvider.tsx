import { createContext, useContext } from "react";
import type { OnboardingCommandClient } from "./types";

const OnboardingCommandClientContext =
  createContext<OnboardingCommandClient | null>(null);

export function OnboardingCommandClientProvider({
  client,
  children,
}: {
  client: OnboardingCommandClient;
  children: React.ReactNode;
}) {
  return (
    <OnboardingCommandClientContext.Provider value={client}>
      {children}
    </OnboardingCommandClientContext.Provider>
  );
}

export function useOnboardingCommandClient() {
  const client = useContext(OnboardingCommandClientContext);
  if (!client) throw new Error("OnboardingCommandClientProvider is required.");
  return client;
}
