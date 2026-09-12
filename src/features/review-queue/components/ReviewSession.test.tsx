import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewQueueCommandClientProvider } from "../commands/ReviewQueueCommandClientProvider";
import { ReviewSessionCommandClientProvider } from "../commands/ReviewSessionCommandClientProvider";
import type { HomeReviewQueueEntry, ReviewSessionCommandClient } from "../commands/types";
import { ReviewSession } from "./ReviewSession";

const entry: HomeReviewQueueEntry = {
  learningItemId: 4,
  title: "TypeScript generics",
  folder: { id: 2, name: "TypeScript", ancestors: [{ id: 1, name: "Web Foundations" }] },
  kind: "dueReview",
};
function renderSession(
  client: ReviewSessionCommandClient,
  onAbandon = () => {},
  onCompleted = () => {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["review-queue", "home"], [entry]);
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueueCommandClientProvider client={{ getHomeReviewQueue: async () => [entry] }}>
        <ReviewSessionCommandClientProvider client={client}>
          <ReviewSession learningItemId={4} onAbandon={onAbandon} onCompleted={onCompleted} />
        </ReviewSessionCommandClientProvider>
      </ReviewQueueCommandClientProvider>
    </QueryClientProvider>,
  );
}

it("activates a title-only session with four accessible star radios and disabled submit", () => {
  renderSession({
    completeDueReview: async () => ({
      learningItemId: 4,
      reviewEventId: 1,
      rating: "good",
      eventKind: "scheduled",
      completedOn: "2026-09-11",
      nextReviewDate: "2026-09-12",
    }),
  });
  expect(screen.getByRole("heading", { name: "TypeScript generics" })).toBeVisible();
  expect(screen.getAllByRole("radio", { name: /^Rate recall:/ })).toHaveLength(4);
  expect(screen.getByRole("button", { name: "Submit rating" })).toBeDisabled();
  expect(screen.queryByText(/answer|notes|question|source/i)).not.toBeInTheDocument();
});

it("moves focus to the session title on entry", async () => {
  renderSession({
    completeDueReview: async () => ({
      learningItemId: 4,
      reviewEventId: 1,
      rating: "good",
      eventKind: "scheduled",
      completedOn: "2026-09-11",
      nextReviewDate: "2026-09-12",
    }),
  });

  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "TypeScript generics" })).toHaveFocus(),
  );
});

it("abandons without calling completion", async () => {
  const user = userEvent.setup();
  let calls = 0;
  const onAbandon = () => {
    calls += 1;
  };
  const completeDueReview = async () => {
    throw new Error("must not call");
  };
  renderSession({ completeDueReview }, onAbandon);
  await user.click(screen.getByRole("button", { name: "Exit review; abandon review" }));
  expect(calls).toBe(1);
});

it("suppresses duplicates while retaining the selected rating through retry", async () => {
  const user = userEvent.setup();
  let resolve: ((value: never) => void) | undefined;
  let calls = 0;
  const client: ReviewSessionCommandClient = {
    completeDueReview: async () => {
      calls += 1;
      return new Promise((_, reject) => {
        resolve = reject;
      });
    },
  };
  renderSession(client);
  await user.click(screen.getByRole("radio", { name: "Rate recall: Hard, 2 of 4" }));
  await user.click(screen.getByRole("button", { name: "Submit rating" }));
  expect(screen.getByText("Saving review")).toBeVisible();
  expect(screen.getByRole("button", { name: "Exit review; abandon review" })).toBeDisabled();
  resolve?.({ code: "database_unavailable", field: null, message: "locked" } as never);
  await waitFor(() => expect(screen.getByText("Review couldn't be saved.")).toBeVisible());
  await user.click(screen.getByRole("button", { name: "Retry saving review" }));
  expect(calls).toBe(2);
});

it("returns after success and refreshes the Home query", async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["review-queue", "home"], [entry]);
  let queueReads = 0;
  let completed = 0;
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueueCommandClientProvider
        client={{
          getHomeReviewQueue: async () => {
            queueReads += 1;
            return [entry];
          },
        }}
      >
        <ReviewSessionCommandClientProvider
          client={{
            completeDueReview: async () => ({
              learningItemId: 4,
              reviewEventId: 1,
              rating: "good",
              eventKind: "scheduled",
              completedOn: "2026-09-11",
              nextReviewDate: "2026-09-12",
            }),
          }}
        >
          <ReviewSession
            learningItemId={4}
            onAbandon={() => {}}
            onCompleted={() => {
              completed += 1;
            }}
          />
        </ReviewSessionCommandClientProvider>
      </ReviewQueueCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("radio", { name: "Rate recall: Good, 3 of 4" }));
  await user.click(screen.getByRole("button", { name: "Submit rating" }));
  await waitFor(() => expect(completed).toBe(1));
  expect(queueReads).toBeGreaterThanOrEqual(2);
});

it("retains a truthful recovery state when success refresh fails, then returns after retry", async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["review-queue", "home"], [entry]);
  let queueReads = 0;
  let completed = 0;
  const queueClient = {
    getHomeReviewQueue: async () => {
      queueReads += 1;
      if (queueReads > 1) throw new Error("refresh unavailable");
      return [entry];
    },
  };
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueueCommandClientProvider client={queueClient}>
        <ReviewSessionCommandClientProvider
          client={{
            completeDueReview: async () => ({
              learningItemId: 4,
              reviewEventId: 1,
              rating: "good",
              eventKind: "scheduled",
              completedOn: "2026-09-11",
              nextReviewDate: "2026-09-12",
            }),
          }}
        >
          <ReviewSession
            learningItemId={4}
            onAbandon={() => {}}
            onCompleted={() => {
              completed += 1;
            }}
          />
        </ReviewSessionCommandClientProvider>
      </ReviewQueueCommandClientProvider>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole("radio", { name: "Rate recall: Good, 3 of 4" }));
  await user.click(screen.getByRole("button", { name: "Submit rating" }));
  expect(await screen.findByText("Review saved, but Home couldn't refresh.")).toBeVisible();
  expect(completed).toBe(0);
  queueClient.getHomeReviewQueue = async () => {
    queueReads += 1;
    return [];
  };
  await user.click(screen.getByRole("button", { name: "Retry refreshing Home" }));
  await waitFor(() => expect(completed).toBe(1));
});

it("keeps stale recovery refresh failures explicit and recoverable", async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["review-queue", "home"], [entry]);
  let queueReads = 0;
  const queueClient = {
    getHomeReviewQueue: async () => {
      queueReads += 1;
      if (queueReads > 1) throw new Error("refresh unavailable");
      return [entry];
    },
  };
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueueCommandClientProvider client={queueClient}>
        <ReviewSessionCommandClientProvider
          client={{
            completeDueReview: async () => {
              throw { code: "review_not_eligible", field: null, message: "stale" };
            },
          }}
        >
          <ReviewSession learningItemId={4} onAbandon={() => {}} onCompleted={() => {}} />
        </ReviewSessionCommandClientProvider>
      </ReviewQueueCommandClientProvider>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole("radio", { name: "Rate recall: Good, 3 of 4" }));
  await user.click(screen.getByRole("button", { name: "Submit rating" }));
  expect(
    await screen.findByText("Home couldn't refresh the queue. Retry the refresh before returning."),
  ).toBeVisible();
  queueClient.getHomeReviewQueue = async () => [];
  await user.click(screen.getByRole("button", { name: "Retry refreshing Home" }));
  await waitFor(() =>
    expect(screen.getByText("This Due Review is no longer available.")).toBeVisible(),
  );
});

it("selects a star without saving, and supports roving Arrow-key selection", async () => {
  const user = userEvent.setup();
  let calls = 0;
  renderSession({
    completeDueReview: async () => {
      calls += 1;
      return {
        learningItemId: 4,
        reviewEventId: 1,
        rating: "good",
        eventKind: "scheduled",
        completedOn: "2026-09-11",
        nextReviewDate: "2026-09-12",
      };
    },
  });
  const again = screen.getByRole("radio", { name: "Rate recall: Again, 1 of 4" });
  await user.click(again);
  await user.keyboard("{ArrowRight}{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Rate recall: Good, 3 of 4" })).toHaveFocus();
  expect(screen.getByText("Good")).toBeVisible();
  expect(calls).toBe(0);
  await user.click(screen.getByRole("button", { name: "Submit rating" }));
  await waitFor(() => expect(calls).toBe(1));
});

it("previews candidate rating labels without saving and restores the committed label", () => {
  let calls = 0;
  renderSession({
    completeDueReview: async () => {
      calls += 1;
      return {
        learningItemId: 4,
        reviewEventId: 1,
        rating: "good",
        eventKind: "scheduled",
        completedOn: "2026-09-11",
        nextReviewDate: "2026-09-12",
      };
    },
  });

  const again = screen.getByRole("radio", { name: "Rate recall: Again, 1 of 4" });
  const good = screen.getByRole("radio", { name: "Rate recall: Good, 3 of 4" });
  const easy = screen.getByRole("radio", { name: "Rate recall: Easy, 4 of 4" });
  const starOption = (radio: HTMLElement) => {
    const option = radio.parentElement;
    if (!option) throw new Error("A review-session star must have its option wrapper.");
    return option;
  };
  const starGroup = (radio: HTMLElement) => {
    const group = starOption(radio).closest(".review-session-stars");
    if (!group) throw new Error("A review-session star must have a selector group.");
    return group;
  };
  const starFill = (radio: HTMLElement) =>
    starOption(radio).querySelector("svg")?.getAttribute("fill");

  fireEvent.click(again);
  fireEvent.mouseEnter(starOption(good));
  expect(screen.getByText("Good")).toBeVisible();
  expect(starFill(again)).toBe("currentColor");
  expect(starFill(good)).toBe("currentColor");
  expect(starFill(easy)).toBe("none");
  expect(calls).toBe(0);

  fireEvent.mouseLeave(starGroup(good));
  expect(screen.getByText("Again")).toBeVisible();
  expect(starFill(again)).toBe("currentColor");
  expect(starFill(good)).toBe("none");
  expect(starFill(easy)).toBe("none");
  expect(calls).toBe(0);
});

it("keeps preview through internal focus moves and restores the unselected prompt on focus exit", () => {
  let calls = 0;
  renderSession({
    completeDueReview: async () => {
      calls += 1;
      return {
        learningItemId: 4,
        reviewEventId: 1,
        rating: "good",
        eventKind: "scheduled",
        completedOn: "2026-09-11",
        nextReviewDate: "2026-09-12",
      };
    },
  });

  const good = screen.getByRole("radio", { name: "Rate recall: Good, 3 of 4" });
  const easy = screen.getByRole("radio", { name: "Rate recall: Easy, 4 of 4" });
  fireEvent.focus(good);
  expect(screen.getByText("Good")).toBeVisible();
  expect(calls).toBe(0);

  fireEvent.blur(good, { relatedTarget: easy });
  fireEvent.focus(easy);
  expect(screen.getByText("Easy")).toBeVisible();

  fireEvent.blur(easy);
  expect(screen.getByText("Choose a rating")).toBeVisible();
  expect(calls).toBe(0);
});

it("uses one keyboard entry point for an unselected radio group", async () => {
  const user = userEvent.setup();
  renderSession({
    completeDueReview: async () => ({
      learningItemId: 4,
      reviewEventId: 1,
      rating: "good",
      eventKind: "scheduled",
      completedOn: "2026-09-11",
      nextReviewDate: "2026-09-12",
    }),
  });

  await user.tab();
  expect(screen.getByRole("radio", { name: "Rate recall: Again, 1 of 4" })).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Rate recall: Hard, 2 of 4" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Submit rating" })).toHaveFocus();
});
