import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingCommandClientProvider } from "../commands/OnboardingCommandClientProvider";
import { fakeOnboardingCommandClient } from "../commands/fakeOnboardingCommandClient";
import { OnboardingPage } from "./OnboardingPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    render(
      <QueryClientProvider client={queryClient}>
        <OnboardingCommandClientProvider client={fakeOnboardingCommandClient()}>
          <OnboardingPage />
        </OnboardingCommandClientProvider>
      </QueryClientProvider>,
    ),
    queryClient
  );
}

it("blocks a blank display name inline", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Enter a display name to continue.")).toBeVisible();
});

it("trims and completes onboarding", async () => {
  const user = userEvent.setup();
  const queryClient = renderPage();
  await user.type(screen.getByLabelText("Display name"), "  Ada  ");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("button", { name: "Continue" })).toBeEnabled();
  await waitFor(() =>
    expect(queryClient.getQueryData(["onboarding", "learner"])).toEqual({ displayName: "Ada" }),
  );
});
