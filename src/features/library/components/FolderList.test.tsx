import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { useRef, useState } from "react";
import { LibraryCommandClientProvider } from "../commands/LibraryCommandClientProvider";
import { fakeLibraryCommandClient } from "../commands/fakeLibraryCommandClient";
import { useFolderViewQuery, useRootFoldersQuery } from "../queries/useRootFoldersQuery";
import { FolderList } from "./FolderList";
import { LibraryComposer } from "./LibraryComposer";

function FolderListHarness({ parentId = null }: { parentId?: number | null }) {
  const rootFoldersQuery = useRootFoldersQuery();
  const folderViewQuery = useFolderViewQuery(parentId);
  const contents =
    parentId === null
      ? rootFoldersQuery.data?.map((folder) => ({ type: "folder" as const, value: folder }))
      : folderViewQuery.data?.contents;
  if (!contents) return null;
  return (
    <FolderList
      contents={contents}
      parentId={parentId}
      onOpen={() => {}}
      onOpenLearningItem={() => {}}
    />
  );
}

function renderList() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={fakeLibraryCommandClient()}>
        <FolderListHarness />
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );
}

function ControlledFolderListHarness({ consumesEscape = false }: { consumesEscape?: boolean }) {
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const createFolderTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={fakeLibraryCommandClient()}>
        <button
          ref={createFolderTriggerRef}
          type="button"
          onClick={() => setIsCreatingFolder(true)}
        >
          Create Folder
        </button>
        <button
          type="button"
          onKeyDown={(event) => {
            if (consumesEscape && event.key === "Escape") event.preventDefault();
          }}
        >
          Other control
        </button>
        <FolderList
          contents={[]}
          parentId={null}
          onOpen={() => {}}
          onOpenLearningItem={() => {}}
          isCreatingFolder={isCreatingFolder}
          onCreatingFolderChange={setIsCreatingFolder}
          focusReturnRef={createFolderTriggerRef}
          hideCreateFolderAction
        />
      </LibraryCommandClientProvider>
    </QueryClientProvider>
  );
}

function CueItemList({
  title,
  learningItemCue,
  onLearningItemCuePresented,
}: {
  title: string;
  learningItemCue?: { id: number; type: "insertion" | "return" };
  onLearningItemCuePresented?: (learningItemId: number) => void;
}) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={fakeLibraryCommandClient()}>
        <FolderList
          contents={[{ type: "learningItem", value: { id: 7, folderId: 3, title } }]}
          parentId={3}
          onOpen={() => {}}
          onOpenLearningItem={() => {}}
          learningItemCue={learningItemCue}
          onLearningItemCuePresented={onLearningItemCuePresented}
        />
      </LibraryCommandClientProvider>
    </QueryClientProvider>
  );
}

it("creates a trimmed root Folder from the empty Library", async () => {
  const user = userEvent.setup();
  renderList();
  await user.click(await screen.findByRole("button", { name: "Create Folder" }));
  expect(screen.getByLabelText("Folder name")).toHaveFocus();
  await user.type(screen.getByLabelText("Folder name"), "  Algorithms  ");
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Algorithms")).toBeVisible();
});

it("keeps a blank Folder name active with inline validation", async () => {
  const user = userEvent.setup();
  renderList();
  await user.click(await screen.findByRole("button", { name: "Create Folder" }));
  const input = screen.getByLabelText("Folder name");
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Enter a Folder name.")).toBeVisible();
  expect(input).toHaveFocus();
});

it("keeps a duplicate Folder name active with backend validation", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider
        client={fakeLibraryCommandClient([{ id: 1, name: "Algorithms" }])}
      >
        <FolderListHarness />
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Create Folder" }));
  const input = screen.getByLabelText("Folder name");
  await user.type(input, "Algorithms");
  await user.keyboard("{Enter}");
  expect(await screen.findByText("A Folder with that name already exists here.")).toBeVisible();
  expect(input).toHaveValue("Algorithms");
});

it("shows a structured command validation error without discarding the draft", async () => {
  const user = userEvent.setup();
  const client = fakeLibraryCommandClient();
  client.createFolder = async () =>
    Promise.reject({
      code: "duplicate_folder_name",
      field: "name",
      message: "A Folder with that name already exists here.",
    });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={client}>
        <FolderListHarness />
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Create Folder" }));
  const input = screen.getByLabelText("Folder name");
  await user.type(input, "Algorithms");
  await user.keyboard("{Enter}");
  expect(await screen.findByText("A Folder with that name already exists here.")).toBeVisible();
  expect(input).toHaveValue("Algorithms");
});

it("cancels an inline root Folder creation with Escape", async () => {
  const user = userEvent.setup();
  renderList();
  await user.click(await screen.findByRole("button", { name: "Create Folder" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByLabelText("Folder name")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Folder" })).toHaveFocus();
});

it("cancels Folder creation after focus leaves the input and restores focus to its trigger", async () => {
  const user = userEvent.setup();
  render(<ControlledFolderListHarness />);

  const trigger = screen.getByRole("button", { name: "Create Folder" });
  await user.click(trigger);
  await user.type(screen.getByLabelText("Folder name"), "Draft Folder");
  await user.click(screen.getByRole("button", { name: "Other control" }));
  await user.keyboard("{Escape}");

  expect(screen.queryByLabelText("Folder name")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(screen.getByLabelText("Folder name")).toHaveValue("");
});

it("leaves Folder creation open when the focused control consumes Escape", async () => {
  const user = userEvent.setup();
  render(<ControlledFolderListHarness consumesEscape />);

  await user.click(screen.getByRole("button", { name: "Create Folder" }));
  await user.click(screen.getByRole("button", { name: "Other control" }));
  await user.keyboard("{Escape}");

  expect(screen.getByLabelText("Folder name")).toBeVisible();
});

it("creates a child Folder without appending it out of backend order", async () => {
  const user = userEvent.setup();
  const client = fakeLibraryCommandClient([{ id: 1, name: "Algorithms" }]);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={client}>
        <FolderListHarness parentId={1} />
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Create Folder" }));
  await user.type(screen.getByLabelText("Folder name"), "Graphs");
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("button", { name: "Graphs" })).toBeVisible();
});

it("navigates nested Folders with breadcrumbs and Up", async () => {
  const user = userEvent.setup();
  const client = fakeLibraryCommandClient([
    { id: 1, name: "Algorithms" },
    { id: 2, name: "Graphs", parentId: 1 },
  ]);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={client}>
        <LibraryComposer />
      </LibraryCommandClientProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Algorithms" }));
  expect(await screen.findByRole("heading", { name: "Algorithms" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Graphs" }));
  expect(await screen.findByRole("heading", { name: "Graphs" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Up" }));
  expect(await screen.findByRole("heading", { name: "Algorithms" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Library" }));
  expect(await screen.findByRole("heading", { name: "Library" })).toBeVisible();
});

it("presents a return cue once, then clears its parent state", () => {
  vi.useFakeTimers();
  const onLearningItemCuePresented = vi.fn<(learningItemId: number) => void>();
  const view = render(
    <CueItemList
      title="Returned item"
      learningItemCue={{ id: 7, type: "return" }}
      onLearningItemCuePresented={onLearningItemCuePresented}
    />,
  );

  const row = screen.getByRole("button", { name: "Returned item" });
  expect(row).toHaveClass("learning-item-returning");
  expect(onLearningItemCuePresented).toHaveBeenCalledTimes(1);

  view.rerender(
    <CueItemList
      title="Returned item"
      learningItemCue={{ id: 7, type: "return" }}
      onLearningItemCuePresented={onLearningItemCuePresented}
    />,
  );
  expect(onLearningItemCuePresented).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(700));
  expect(row).not.toHaveClass("learning-item-returning");
  vi.useRealTimers();
});

it("wraps a newly created item in the reusable insertion motion", () => {
  render(<CueItemList title="New item" learningItemCue={{ id: 7, type: "insertion" }} />);

  expect(screen.getByRole("button", { name: "New item" })).toHaveClass("learning-item-inserting");
  expect(screen.getByRole("button", { name: "New item" }).parentElement?.parentElement).toHaveClass(
    "learning-item-insertion",
  );
});

it("keeps the full long title accessible while the row uses the ellipsis contract", () => {
  const title = "Extremely long title ".repeat(20).trim();
  render(<CueItemList title={title} />);

  const row = screen.getByRole("button", { name: title });
  expect(row).toHaveAttribute("title", title);
  expect(row).toHaveClass("library-row", "learning-item-row");
  expect(row.querySelector(".learning-item-row-title")).toHaveTextContent(title);
});
