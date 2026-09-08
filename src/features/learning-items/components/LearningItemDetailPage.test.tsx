import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LearningItemsCommandClientProvider } from "../commands/LearningItemsCommandClientProvider";
import { fakeLearningItemsCommandClient } from "../commands/fakeLearningItemsCommandClient";
import type { LearningItemDetail, LearningItemsCommandClient } from "../commands/types";
import { learningItemsQueryKeys } from "../queries/queryKeys";
import { LearningItemDetailPage } from "./LearningItemDetailPage";

const detail: LearningItemDetail = {
  id: 4,
  title: "Binary Search",
  folder: {
    id: 2,
    name: "Searching",
    ancestors: [{ id: 1, name: "Algorithms" }],
  },
  reviewDate: "2026-09-08",
  hasReviewHistory: false,
};

function renderDetail(options: { onReturnToFolder?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LearningItemsCommandClientProvider
        client={fakeLearningItemsCommandClient(undefined, [detail])}
      >
        <LearningItemDetailPage
          learningItemId={4}
          onReturnToFolder={options.onReturnToFolder ?? (() => {})}
        />
      </LearningItemsCommandClientProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

it("shows the origin-only detail and saves a canonical trimmed title into its exact cache entry", async () => {
  const user = userEvent.setup();
  const queryClient = renderDetail();

  expect(await screen.findByRole("heading", { name: "Binary Search" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Back to Folder" })).toBeVisible();
  expect(screen.getByText("Algorithms / Searching")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Algorithms / Searching" })).not.toBeInTheDocument();
  expect(screen.queryByText("First review")).not.toBeInTheDocument();
  expect(screen.queryByText("Not reviewed yet")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByText("Algorithms / Searching")).toBeVisible();
  const title = screen.getByLabelText("Title");
  expect(title).toHaveFocus();
  await user.clear(title);
  await user.type(title, "  Binary Search Trees  ");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("heading", { name: "Binary Search Trees" })).toBeVisible();
  expect(
    queryClient.getQueryData<LearningItemDetail>(learningItemsQueryKeys.detail(4)),
  ).toMatchObject({
    title: "Binary Search Trees",
  });
});

it("keeps an over-limit title active with inline validation", async () => {
  const user = userEvent.setup();
  renderDetail();
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.type(title, "a".repeat(121));
  expect(
    await screen.findByText("Keep Learning Item titles to 120 characters or fewer."),
  ).toBeVisible();
  expect(title).toHaveValue("a".repeat(121));
  expect(title).toHaveFocus();
});

it("keeps the focused title draft for local and sibling-duplicate failures", async () => {
  const user = userEvent.setup();
  const duplicate: LearningItemDetail = { ...detail, id: 5, title: "Hash Table" };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LearningItemsCommandClientProvider
        client={fakeLearningItemsCommandClient(undefined, [detail, duplicate])}
      >
        <LearningItemDetailPage learningItemId={4} onReturnToFolder={() => {}} />
      </LearningItemsCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Enter a Learning Item title.")).toBeVisible();
  expect(title).toHaveFocus();

  await user.type(title, "Hash Table");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    await screen.findByText("A Learning Item with that title already exists in this Folder."),
  ).toBeVisible();
  expect(title).toHaveValue("Hash Table");
  expect(title).toHaveFocus();
});

it("cancels without changing the saved detail and returns to the Folder", async () => {
  const user = userEvent.setup();
  const onReturnToFolder = vi.fn<() => void>();
  renderDetail({ onReturnToFolder });
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.type(title, "Discarded title");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("heading", { name: "Binary Search" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Back to Folder" }));
  expect(onReturnToFolder).toHaveBeenCalledTimes(1);
});

it("keeps the edit visible and disables its actions while a save is pending", async () => {
  const user = userEvent.setup();
  let resolveUpdate: (value: LearningItemDetail) => void;
  const pendingUpdate = new Promise<LearningItemDetail>((resolve) => {
    resolveUpdate = resolve;
  });
  const client: LearningItemsCommandClient = {
    createLearningItem: async () => ({ id: 1, folderId: 2, title: "Unused" }),
    getLearningItemDetail: async () => detail,
    updateLearningItemTitle: async () => pendingUpdate,
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LearningItemsCommandClientProvider client={client}>
        <LearningItemDetailPage learningItemId={4} onReturnToFolder={() => {}} />
      </LearningItemsCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

  resolveUpdate!({ ...detail, title: "Binary Search Trees" });
  expect(await screen.findByRole("heading", { name: "Binary Search Trees" })).toBeVisible();
});

it("retains the missing-item draft and gives it an actionable Folder recovery", async () => {
  const user = userEvent.setup();
  const onReturnToFolder = vi.fn<() => void>();
  const client: LearningItemsCommandClient = {
    createLearningItem: async () => ({ id: 1, folderId: 2, title: "Unused" }),
    getLearningItemDetail: async () => detail,
    updateLearningItemTitle: async () => {
      throw { code: "learning_item_not_found", message: "This Learning Item no longer exists." };
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LearningItemsCommandClientProvider client={client}>
        <LearningItemDetailPage learningItemId={4} onReturnToFolder={onReturnToFolder} />
      </LearningItemsCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.type(title, "Still here");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("This Learning Item no longer exists.")).toBeVisible();
  expect(title).toHaveValue("Still here");
  await user.click(screen.getAllByRole("button", { name: "Back to Folder" }).at(-1)!);
  expect(onReturnToFolder).toHaveBeenCalledTimes(1);
});
