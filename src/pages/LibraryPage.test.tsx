import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LearningItemsCommandClientProvider } from "../features/learning-items/commands/LearningItemsCommandClientProvider";
import { fakeLearningItemsCommandClient } from "../features/learning-items/commands/fakeLearningItemsCommandClient";
import { LibraryCommandClientProvider } from "../features/library/commands/LibraryCommandClientProvider";
import type { LibraryCommandClient } from "../features/library/commands/types";
import { LibraryPage } from "./LibraryPage";

it("creates from a Folder only, then returns to the highlighted backend-ordered row", async () => {
  const user = userEvent.setup();
  const items: Array<{ id: number; folderId: number; title: string }> = [];
  const libraryClient: LibraryCommandClient = {
    getRootFolders: async () => [{ id: 1, name: "Algorithms" }],
    getFolderView: async (folderId) => {
      if (folderId === 1) {
        return {
          folder: { id: 1, name: "Algorithms" },
          ancestors: [],
          contents: [{ type: "folder", value: { id: 2, name: "Searching" } }],
        };
      }
      return {
        folder: { id: 2, name: "Searching" },
        ancestors: [{ id: 1, name: "Algorithms" }],
        contents: items.map((item) => ({ type: "learningItem" as const, value: item })),
      };
    },
    createFolder: async () => ({ id: 3, name: "Unused" }),
  };
  const learningItemsClient = fakeLearningItemsCommandClient(async ({ folderId, title }) => {
    const item = { id: 4, folderId, title: title.trim() };
    items.push(item);
    return item;
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={libraryClient}>
        <LearningItemsCommandClientProvider client={learningItemsClient}>
          <LibraryPage />
        </LearningItemsCommandClientProvider>
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );

  expect(screen.queryByRole("button", { name: "New Learning Item" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Folder" })).toBeVisible();
  expect(screen.getByText("Organize saved learning into Folders.")).toBeVisible();
  await user.click(await screen.findByRole("button", { name: "Algorithms" }));
  expect(screen.queryByText("Organize saved learning into Folders.")).not.toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Searching" }));
  expect(screen.getByText("No Learning Items or Folders yet.")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Create Folder" })).toHaveLength(1);
  await user.click(await screen.findByRole("button", { name: "New Learning Item" }));
  await user.type(screen.getByLabelText("Title"), "Binary Search");
  await user.click(screen.getByRole("button", { name: "Save Learning Item" }));

  await waitFor(() =>
    expect(screen.getByText("Binary Search").closest(".library-row")).toHaveClass(
      "learning-item-highlight",
    ),
  );
  expect(screen.getByRole("button", { name: "New Learning Item" })).toBeVisible();
});

it("shows the clicked Folder context while its contents are loading", async () => {
  const user = userEvent.setup();
  let resolveSearching: (value: {
    folder: { id: number; name: string };
    ancestors: Array<{ id: number; name: string }>;
    contents: [];
  }) => void;
  const searchingView = new Promise<{
    folder: { id: number; name: string };
    ancestors: Array<{ id: number; name: string }>;
    contents: [];
  }>((resolve) => {
    resolveSearching = resolve;
  });
  const libraryClient: LibraryCommandClient = {
    getRootFolders: async () => [{ id: 1, name: "Algorithms" }],
    getFolderView: async (folderId) => {
      if (folderId === 1) {
        return {
          folder: { id: 1, name: "Algorithms" },
          ancestors: [],
          contents: [{ type: "folder" as const, value: { id: 2, name: "Searching" } }],
        };
      }
      return searchingView;
    },
    createFolder: async () => ({ id: 3, name: "Unused" }),
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={libraryClient}>
        <LibraryPage />
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );

  await user.click(await screen.findByRole("button", { name: "Algorithms" }));
  await user.click(await screen.findByRole("button", { name: "Searching" }));

  expect(screen.getByRole("heading", { name: "Searching" })).toBeVisible();
  expect(screen.getByLabelText("Opening Folder contents")).toBeVisible();
  expect(screen.getByRole("button", { name: "New Learning Item" })).toBeDisabled();

  resolveSearching!({
    folder: { id: 2, name: "Searching" },
    ancestors: [{ id: 1, name: "Algorithms" }],
    contents: [],
  });
  expect(await screen.findByText("No Learning Items or Folders yet.")).toBeVisible();
});
