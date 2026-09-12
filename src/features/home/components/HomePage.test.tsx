import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewQueueCommandClientProvider } from "../../review-queue/commands/ReviewQueueCommandClientProvider";
import { fakeReviewQueueCommandClient } from "../../review-queue/commands/fakeReviewQueueCommandClient";
import type {
  HomeReviewQueueEntry,
  ReviewQueueCommandClient,
} from "../../review-queue/commands/types";
import { HomePage } from "./HomePage";

function renderHome(client: ReviewQueueCommandClient, focusQueueOnMount = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueueCommandClientProvider client={client}>
        <HomePage displayName="Alex" focusQueueOnMount={focusQueueOnMount} />
      </ReviewQueueCommandClientProvider>
    </QueryClientProvider>,
  );
}

const entries: HomeReviewQueueEntry[] = [
  {
    learningItemId: 4,
    title: "TypeScript generics",
    folder: { id: 2, name: "TypeScript", ancestors: [{ id: 1, name: "Web Foundations" }] },
    kind: "dueReview",
  },
  {
    learningItemId: 5,
    title: "Caching strategies",
    folder: { id: 3, name: "Performance", ancestors: [{ id: 1, name: "Web Foundations" }] },
    kind: "dueReview",
  },
];

it("renders the approved populated Home and preserves returned FIFO order", async () => {
  renderHome(fakeReviewQueueCommandClient(entries));

  expect(screen.getByLabelText("Loading Review Queue")).toBeInTheDocument();
  expect(await screen.findByText("Welcome back, Alex.")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Review Queue" })).toBeVisible();
  expect(await screen.findByText("2 Due Reviews")).toBeVisible();
  expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
    expect.stringContaining("TypeScript generics"),
    expect.stringContaining("Caching strategies"),
  ]);
  expect(
    screen.getByRole("button", {
      name: "Review TypeScript generics, Web Foundations / TypeScript, Due Review",
    }),
  ).toBeVisible();
  expect(screen.queryByRole("link", { name: /TypeScript generics/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/FIFO Queue|Display only|ordered by when/i)).not.toBeInTheDocument();
});

it("renders the known empty count without a CTA", async () => {
  renderHome(fakeReviewQueueCommandClient());

  expect(await screen.findByText("No reviews queued.")).toBeVisible();
  expect(screen.getByText("0 Due Reviews")).toBeVisible();
  expect(screen.getByText("You're clear for now.")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("replaces an error with retry-pending and recovers coherently", async () => {
  const user = userEvent.setup();
  let shouldFail = true;
  let resolveRetry: ((value: HomeReviewQueueEntry[]) => void) | undefined;
  const client: ReviewQueueCommandClient = {
    getHomeReviewQueue: async () => {
      if (shouldFail) throw { code: "database_unavailable", message: "unavailable" };
      return new Promise((resolve) => {
        resolveRetry = resolve;
      });
    },
  };
  renderHome(client);

  const retry = await screen.findByRole("button", { name: "Retry" });
  expect(screen.getByText("Review Queue couldn't load.")).toBeVisible();
  expect(screen.queryByText(/Due Reviews$/)).not.toBeInTheDocument();
  shouldFail = false;
  await user.click(retry);
  expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
  resolveRetry?.(entries);
  await waitFor(() => expect(screen.getByText("2 Due Reviews")).toBeVisible());
  expect(screen.queryByText("Review Queue couldn't load.")).not.toBeInTheDocument();
});

it("does not render stale rows while the query is in an error state", async () => {
  const failingClient: ReviewQueueCommandClient = {
    getHomeReviewQueue: async () => {
      throw { code: "database_unavailable", message: "unavailable" };
    },
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["review-queue", "home"], entries);
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueueCommandClientProvider client={failingClient}>
        <HomePage displayName="Alex" />
      </ReviewQueueCommandClientProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Review Queue couldn't load.")).toBeVisible();
  expect(screen.queryByText("TypeScript generics")).not.toBeInTheDocument();
});

it("focuses the queue heading when returning from a completed review", async () => {
  renderHome(fakeReviewQueueCommandClient(entries), true);

  await waitFor(() => expect(screen.getByRole("heading", { name: "Review Queue" })).toHaveFocus());
});
