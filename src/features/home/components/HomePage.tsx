import { useEffect, useRef, useState } from "react";
import { FileText, Folder } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useHomeReviewQueueQuery } from "../../review-queue/queries/useHomeReviewQueueQuery";
import type { HomeReviewQueueEntry } from "../../review-queue/commands/types";

function folderPath(entry: HomeReviewQueueEntry) {
  return [...entry.folder.ancestors, entry.folder].map((folder) => folder.name).join(" / ");
}

function ReviewQueueRow({ entry }: { entry: HomeReviewQueueEntry }) {
  const path = folderPath(entry);
  return (
    <li className="review-queue-row" aria-label={`${entry.title}, ${path}, Due Review`}>
      <FileText className="review-queue-row-icon" size={18} aria-hidden="true" />
      <div className="review-queue-row-content">
        <span className="review-queue-row-title">{entry.title}</span>
        <span className="review-queue-row-folder">
          <Folder size={14} aria-hidden="true" />
          {path}
        </span>
      </div>
      <span className="review-queue-row-status">Due Review</span>
    </li>
  );
}

function LoadingQueue() {
  return (
    <div
      className="review-queue-list review-queue-loading"
      aria-busy="true"
      aria-label="Loading Review Queue"
    >
      {[1, 2, 3].map((placeholder) => (
        <span key={placeholder} aria-hidden="true" />
      ))}
    </div>
  );
}

export function HomePage({ displayName }: { displayName: string }) {
  const queueQuery = useHomeReviewQueueQuery();
  const [isRetrying, setIsRetrying] = useState(false);
  const errorRegionRef = useRef<HTMLDivElement>(null);
  const hasFocusedInitialError = useRef(false);

  useEffect(() => {
    if (queueQuery.isError && !queueQuery.isFetching && !hasFocusedInitialError.current) {
      errorRegionRef.current?.focus();
      hasFocusedInitialError.current = true;
    }
  }, [queueQuery.isError, queueQuery.isFetching]);

  const entries = queueQuery.data;
  const showError = queueQuery.isError || isRetrying;
  const showLoading = !showError && (queueQuery.isPending || queueQuery.isFetching);

  async function retryReviewQueue() {
    setIsRetrying(true);
    await queueQuery.refetch();
    setIsRetrying(false);
  }

  return (
    <>
      <header className="home-header">
        <p className="eyebrow">HOME</p>
        <h1>Welcome back, {displayName}.</h1>
      </header>
      <section className="review-queue-section" aria-labelledby="review-queue-title">
        <div className="review-queue-heading">
          <h2 id="review-queue-title">Review Queue</h2>
          {entries && !showError && (
            <span className="review-queue-count">
              {entries.length} Due Review{entries.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {showLoading && <LoadingQueue />}
        {showError && (
          <div
            ref={errorRegionRef}
            className="review-queue-state review-queue-error"
            role="alert"
            tabIndex={-1}
          >
            <p>Review Queue couldn&apos;t load.</p>
            <p>Try again to check for Due Reviews.</p>
            <Button type="button" disabled={isRetrying} onClick={() => void retryReviewQueue()}>
              {isRetrying ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}
        {!showLoading && !showError && entries?.length === 0 && (
          <div className="review-queue-state review-queue-empty">
            <p>No reviews queued.</p>
            <p>You&apos;re clear for now.</p>
          </div>
        )}
        {!showLoading && !showError && entries && entries.length > 0 && (
          <ul className="review-queue-list" aria-label="Due Reviews">
            {entries.map((entry) => (
              <ReviewQueueRow key={entry.learningItemId} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
