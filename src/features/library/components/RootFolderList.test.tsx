import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryCommandClientProvider } from "../commands/LibraryCommandClientProvider";
import { fakeLibraryCommandClient } from "../commands/fakeLibraryCommandClient";
import { useRootFoldersQuery } from "../queries/useRootFoldersQuery";
import { RootFolderList } from "./RootFolderList";

function RootFolderListHarness() {
  const rootFoldersQuery = useRootFoldersQuery();
  if (!rootFoldersQuery.data) return null;
  return <RootFolderList folders={rootFoldersQuery.data} />;
}

function renderList() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LibraryCommandClientProvider client={fakeLibraryCommandClient()}>
        <RootFolderListHarness />
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

it("cancels an inline root Folder creation with Escape", async () => {
  const user = userEvent.setup();
  renderList();
  await user.click(await screen.findByRole("button", { name: "Create Folder" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByLabelText("Folder name")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Folder" })).toBeVisible();
});
