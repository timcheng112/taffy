import { createContext, useContext } from "react";
import type { LibraryCommandClient } from "./types";

const LibraryCommandClientContext = createContext<LibraryCommandClient | null>(null);

export function LibraryCommandClientProvider({
  client,
  children,
}: {
  client: LibraryCommandClient;
  children: React.ReactNode;
}) {
  return (
    <LibraryCommandClientContext.Provider value={client}>
      {children}
    </LibraryCommandClientContext.Provider>
  );
}

export function useLibraryCommandClient() {
  const client = useContext(LibraryCommandClientContext);
  if (!client) throw new Error("LibraryCommandClientProvider is required.");
  return client;
}
