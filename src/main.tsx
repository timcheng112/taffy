import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { queryClient } from "./app/queryClient";
import { OnboardingCommandClientProvider } from "./features/onboarding";
import { tauriOnboardingCommandClient } from "./features/onboarding/commands/tauriOnboardingCommandClient";
import "./shared/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Taffy could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <OnboardingCommandClientProvider client={tauriOnboardingCommandClient}>
        <App />
      </OnboardingCommandClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
