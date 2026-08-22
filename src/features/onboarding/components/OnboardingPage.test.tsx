import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingCommandClientProvider } from "../commands/OnboardingCommandClientProvider";
import { fakeOnboardingCommandClient } from "../commands/fakeOnboardingCommandClient";
import type { Learner } from "../commands/types";
import { OnboardingPage } from "./OnboardingPage";

function renderPage(onCompleted = vi.fn<(learner: Learner) => void>()) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OnboardingCommandClientProvider client={fakeOnboardingCommandClient()}>
        <OnboardingPage onCompleted={onCompleted} />
      </OnboardingCommandClientProvider>
    </QueryClientProvider>,
  );
}

it("blocks a blank display name inline", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Enter a display name to continue.")).toBeVisible();
});

it("trims and completes onboarding", async () => {
  const completed = vi.fn<(learner: Learner) => void>();
  const user = userEvent.setup();
  renderPage(completed);
  await user.type(screen.getByLabelText("Display name"), "  Ada  ");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("button", { name: "Continue" })).toBeEnabled();
  expect(completed.mock.calls[0]?.[0]).toEqual({ displayName: "Ada" });
});
