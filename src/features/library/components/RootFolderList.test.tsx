import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryCommandClientProvider } from "../commands/LibraryCommandClientProvider";
import { fakeLibraryCommandClient } from "../commands/fakeLibraryCommandClient";
import { useFolderViewQuery, useRootFoldersQuery } from "../queries/useRootFoldersQuery";
import { FolderList } from "./RootFolderList";
import { LibraryPage } from "../../../pages/LibraryPage";

function FolderListHarness({ parentId = null }: { parentId?: number | null }) {
  const rootFoldersQuery = useRootFoldersQuery();
  const folderViewQuery = useFolderViewQuery(parentId);
  const folders = parentId === null ? rootFoldersQuery.data : folderViewQuery.data?.childFolders;
  if (!folders) return null;
  return <FolderList folders={folders} parentId={parentId} onOpen={() => {}} />;
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
  expect(screen.getByRole("button", { name: "Create Folder" })).toBeVisible();
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
        <LibraryPage />
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
