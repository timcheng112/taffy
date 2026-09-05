import { createContext, useContext } from "react";
import type { LearningItemsCommandClient } from "./types";

const LearningItemsCommandClientContext = createContext<LearningItemsCommandClient | null>(null);

export function LearningItemsCommandClientProvider({
  client,
  children,
}: {
  client: LearningItemsCommandClient;
  children: React.ReactNode;
}) {
  return (
    <LearningItemsCommandClientContext.Provider value={client}>
      {children}
    </LearningItemsCommandClientContext.Provider>
  );
}

export function useLearningItemsCommandClient() {
  const client = useContext(LearningItemsCommandClientContext);
  if (!client) throw new Error("LearningItemsCommandClientProvider is required.");
  return client;
}
