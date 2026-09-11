import { fakeReviewQueueCommandClient } from "./fakeReviewQueueCommandClient";

it("returns canonical rows in the supplied FIFO order without frontend sorting", async () => {
  const entries = [
    {
      learningItemId: 9,
      title: "Zebra",
      folder: { id: 3, name: "Later", ancestors: [] },
      kind: "dueReview" as const,
    },
    {
      learningItemId: 2,
      title: "Alpha",
      folder: { id: 1, name: "Earlier", ancestors: [] },
      kind: "dueReview" as const,
    },
  ];

  await expect(fakeReviewQueueCommandClient(entries).getHomeReviewQueue()).resolves.toEqual(
    entries,
  );
});
