import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppProviders } from "./app/AppProviders";
import "./shared/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Taffy could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
