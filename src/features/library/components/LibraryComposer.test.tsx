import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LearningItemsCommandClientProvider } from "../../learning-items/commands/LearningItemsCommandClientProvider";
import { fakeLearningItemsCommandClient } from "../../learning-items/commands/fakeLearningItemsCommandClient";
import { LibraryCommandClientProvider } from "../commands/LibraryCommandClientProvider";
import type { LibraryCommandClient } from "../commands/types";
import { LibraryComposer } from "./LibraryComposer";

it("creates from a Folder only, then inserts the backend-ordered row with the shared motion", async () => {
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
          <LibraryComposer />
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

  expect(await screen.findByRole("button", { name: "Binary Search" })).toHaveClass(
    "learning-item-inserting",
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
        <LibraryComposer />
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

it("opens a Learning Item row, renames it, then returns to its highlighted origin Folder", async () => {
  const user = userEvent.setup();
  let title = "Binary Search";
  const libraryClient: LibraryCommandClient = {
    getRootFolders: async () => [{ id: 1, name: "Algorithms" }],
    getFolderView: async () => ({
      folder: { id: 1, name: "Algorithms" },
      ancestors: [],
      contents: [{ type: "learningItem", value: { id: 4, folderId: 1, title } }],
    }),
    createFolder: async () => ({ id: 3, name: "Unused" }),
  };
  const learningItemsClient = {
    createLearningItem: async ({
      folderId,
      title: itemTitle,
    }: {
      folderId: number;
      title: string;
    }) => ({
      id: 5,
      folderId,
      title: itemTitle.trim(),
    }),
    getLearningItemDetail: async () => ({
      id: 4,
      title,
      folder: { id: 1, name: "Algorithms", ancestors: [] },
      reviewDate: "2026-09-08",
    }),
    updateLearningItemTitle: async ({
      title: nextTitle,
    }: {
      learningItemId: number;
      title: string;
    }) => {
      title = nextTitle.trim();
      return {
        id: 4,
        title,
        folder: { id: 1, name: "Algorithms", ancestors: [] },
        reviewDate: "2026-09-08",
      };
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={libraryClient}>
        <LearningItemsCommandClientProvider client={learningItemsClient}>
          <LibraryComposer />
        </LearningItemsCommandClientProvider>
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );

  await user.click(await screen.findByRole("button", { name: "Algorithms" }));
  await user.click(await screen.findByRole("button", { name: "Binary Search" }));
  expect(await screen.findByRole("heading", { name: "Binary Search" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const titleInput = screen.getByLabelText("Title");
  expect(titleInput).toHaveFocus();
  await user.clear(titleInput);
  await user.type(titleInput, "  Binary Search Trees  ");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("heading", { name: "Binary Search Trees" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Back to Folder" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Binary Search Trees" })).toHaveClass(
      "learning-item-returning",
    ),
  );
});
