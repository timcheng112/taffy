import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LearningItemsCommandClientProvider } from "../commands/LearningItemsCommandClientProvider";
import { fakeLearningItemsCommandClient } from "../commands/fakeLearningItemsCommandClient";
import { CreateLearningItemPage } from "./CreateLearningItemPage";

function renderCreatePage({
  onCreated = () => {},
  onCancel = () => {},
  create = async ({ folderId, title }: { folderId: number; title: string }) => ({
    id: 3,
    folderId,
    title: title.trim(),
  }),
}: {
  onCreated?: (item: { id: number; folderId: number; title: string }) => void;
  onCancel?: () => void;
  create?: (request: { folderId: number; title: string }) => Promise<{
    id: number;
    folderId: number;
    title: string;
  }>;
} = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LearningItemsCommandClientProvider client={fakeLearningItemsCommandClient(create)}>
        <CreateLearningItemPage
          ancestors={[{ id: 1, name: "Algorithms" }]}
          folder={{ id: 2, name: "Searching" }}
          onCancel={onCancel}
          onCreated={onCreated}
        />
      </LearningItemsCommandClientProvider>
    </QueryClientProvider>,
  );
}

it("focuses the title and shows the containing Folder path", () => {
  renderCreatePage();
  expect(screen.getByLabelText("Title")).toHaveFocus();
  expect(screen.getByText("Library / Algorithms / Searching")).toBeVisible();
});

it("creates a title-only Learning Item and returns the created item", async () => {
  const user = userEvent.setup();
  const created: Array<{ id: number; folderId: number; title: string }> = [];
  renderCreatePage({ onCreated: (item) => created.push(item) });
  await user.type(screen.getByLabelText("Title"), "  Binary Search  ");
  await user.click(screen.getByRole("button", { name: "Save Learning Item" }));
  expect(created).toEqual([{ id: 3, folderId: 2, title: "Binary Search" }]);
});

it("keeps an invalid title active with inline validation", async () => {
  const user = userEvent.setup();
  renderCreatePage();
  const input = screen.getByLabelText("Title");
  await user.click(screen.getByRole("button", { name: "Save Learning Item" }));
  expect(await screen.findByText("Enter a Learning Item title.")).toBeVisible();
  expect(input).toHaveFocus();
});

it("preserves the title after a backend validation failure", async () => {
  const user = userEvent.setup();
  renderCreatePage({
    create: async () =>
      Promise.reject({
        code: "duplicate_learning_item_title",
        field: "title",
        message: "A Learning Item with that title already exists in this Folder.",
      }),
  });
  const input = screen.getByLabelText("Title");
  await user.type(input, "Binary Search");
  await user.click(screen.getByRole("button", { name: "Save Learning Item" }));
  expect(
    await screen.findByText("A Learning Item with that title already exists in this Folder."),
  ).toBeVisible();
  expect(input).toHaveValue("Binary Search");
});

it("cancels back to the originating Folder", async () => {
  const user = userEvent.setup();
  const cancelled = vi.fn<() => void>();
  renderCreatePage({ onCancel: cancelled });
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancelled).toHaveBeenCalledOnce();
});
