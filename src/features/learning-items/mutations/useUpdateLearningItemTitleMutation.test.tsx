import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { FolderView } from "../../library/commands/types";
import { libraryQueryKeys } from "../../library/queries/queryKeys";
import { LearningItemsCommandClientProvider } from "../commands/LearningItemsCommandClientProvider";
import type { LearningItemsCommandClient } from "../commands/types";
import { learningItemsQueryKeys } from "../queries/queryKeys";
import { useUpdateLearningItemTitleMutation } from "./useUpdateLearningItemTitleMutation";

const returnedDetail = {
  id: 4,
  title: "Canonical title",
  folder: { id: 1, name: "Algorithms", ancestors: [] },
  reviewDate: "2026-09-08",
};

function UpdateTitleButton() {
  const updateTitle = useUpdateLearningItemTitleMutation();
  return (
    <button
      type="button"
      onClick={() => updateTitle.mutate({ learningItemId: 4, title: "  Canonical title  " })}
    >
      Rename
    </button>
  );
}

function renderMutation(queryClient: QueryClient, children: ReactNode = <UpdateTitleButton />) {
  const client: LearningItemsCommandClient = {
    createLearningItem: async () => ({ id: 5, folderId: 1, title: "Unused" }),
    getLearningItemDetail: async () => returnedDetail,
    updateLearningItemTitle: async () => returnedDetail,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <LearningItemsCommandClientProvider client={client}>
        {children}
      </LearningItemsCommandClientProvider>
    </QueryClientProvider>,
  );
}

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

it("immediately patches the renamed Learning Item in its cached Folder view", async () => {
  const user = userEvent.setup();
  const queryClient = createQueryClient();
  const folderView: FolderView = {
    folder: { id: 1, name: "Algorithms" },
    ancestors: [],
    contents: [
      { type: "folder", value: { id: 2, name: "Searching" } },
      { type: "learningItem", value: { id: 4, folderId: 1, title: "Old title" } },
    ],
  };
  queryClient.setQueryData(libraryQueryKeys.folderView(1), folderView);
  renderMutation(queryClient);

  await user.click(screen.getByRole("button", { name: "Rename" }));

  await waitFor(() => {
    expect(queryClient.getQueryData(learningItemsQueryKeys.detail(4))).toEqual(returnedDetail);
    expect(queryClient.getQueryData<FolderView>(libraryQueryKeys.folderView(1))).toEqual({
      ...folderView,
      contents: [
        folderView.contents[0],
        { type: "learningItem", value: { id: 4, folderId: 1, title: "Canonical title" } },
      ],
    });
  });
});

it("does not fabricate a missing Folder view or change one without the renamed item", async () => {
  const user = userEvent.setup();
  const queryClient = createQueryClient();
  renderMutation(queryClient);

  await user.click(screen.getByRole("button", { name: "Rename" }));
  await waitFor(() =>
    expect(queryClient.getQueryData(learningItemsQueryKeys.detail(4))).toEqual(returnedDetail),
  );
  expect(queryClient.getQueryData(libraryQueryKeys.folderView(1))).toBeUndefined();

  const nonmatchingFolderView: FolderView = {
    folder: { id: 1, name: "Algorithms" },
    ancestors: [],
    contents: [{ type: "learningItem", value: { id: 9, folderId: 1, title: "Other item" } }],
  };
  const secondQueryClient = createQueryClient();
  secondQueryClient.setQueryData(libraryQueryKeys.folderView(1), nonmatchingFolderView);
  renderMutation(secondQueryClient, <UpdateTitleButton />);

  await user.click(screen.getAllByRole("button", { name: "Rename" })[1]);
  await waitFor(() =>
    expect(secondQueryClient.getQueryData(learningItemsQueryKeys.detail(4))).toEqual(
      returnedDetail,
    ),
  );
  expect(secondQueryClient.getQueryData(libraryQueryKeys.folderView(1))).toBe(
    nonmatchingFolderView,
  );
});
