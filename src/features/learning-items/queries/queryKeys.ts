export const learningItemsQueryKeys = {
  all: () => ["learning-items"] as const,
  create: (folderId: number) => ["learning-items", "create", folderId] as const,
};
