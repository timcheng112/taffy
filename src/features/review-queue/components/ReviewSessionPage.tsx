import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import type { HomeReviewQueueEntry, RecallRating } from "../commands/types";
import { useReviewSession } from "../hooks/useReviewSession";
import { RecallRatingSelector } from "./RecallRatingSelector";

function folderPath(entry: HomeReviewQueueEntry) {
  return [...entry.folder.ancestors, entry.folder].map((folder) => folder.name).join(" / ");
}

export function ReviewSessionPage({
  learningItemId,
  onAbandon,
  onCompleted,
}: {
  learningItemId: number;
  onAbandon: () => void;
  onCompleted: () => void;
}) {
  const [rating, setRating] = useState<RecallRating | null>(null);
  const [preview, setPreview] = useState<RecallRating | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const session = useReviewSession({ learningItemId, onCompleted });

  useEffect(() => {
    if (session.isSaveError || session.refreshRecovery !== null || session.isMissingEntry) {
      errorRef.current?.focus();
    }
  }, [session.isMissingEntry, session.isSaveError, session.refreshRecovery]);

  useEffect(() => {
    if (session.entry) titleRef.current?.focus();
  }, [session.entry]);

  function selectRating(nextRating: RecallRating) {
    if (session.isPending) return;
    setRating(nextRating);
    setPreview(nextRating);
  }

  if (!session.entry) {
    return (
      <main className="review-session review-session-state">
        <div ref={errorRef} tabIndex={-1} role="alert" className="review-session-error">
          <h1>This Due Review is no longer available.</h1>
          <p>Return to Home to refresh the queue.</p>
          <Button variant="secondary" onClick={onAbandon} aria-label="Exit review; abandon review">
            Exit review
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="review-session" aria-labelledby="review-session-title">
      <button
        className="review-session-exit"
        type="button"
        disabled={session.isPending}
        onClick={onAbandon}
        aria-label="Exit review; abandon review"
      >
        Exit review
      </button>
      <div className="review-session-context-group">
        <p className="eyebrow">REVIEW SESSION</p>
        <p className="review-session-context">Due Review · {folderPath(session.entry)}</p>
        <h1 id="review-session-title" ref={titleRef} tabIndex={-1}>
          {session.entry.title}
        </h1>
      </div>
      {session.isPending ? (
        <output className="review-session-pending" aria-live="polite">
          <div className="review-session-saving-line">
            <span className="review-session-saving-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>Saving review</strong>
          </div>
          <p>Your review is being recorded.</p>
        </output>
      ) : session.refreshRecovery === "completion" ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="review-session-error">
          <strong>Review saved, but Home couldn&apos;t refresh.</strong>
          <p>The review was recorded. Refresh Home to confirm the updated queue.</p>
          <Button onClick={session.retryHomeRefresh} disabled={session.isRefreshing}>
            {session.isRefreshing ? "Refreshing Home…" : "Retry refreshing Home"}
          </Button>
        </div>
      ) : session.isStale ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="review-session-error">
          <strong>This Due Review is no longer available.</strong>
          <p>
            {session.refreshRecovery === "stale"
              ? "Home couldn't refresh the queue. Retry the refresh before returning."
              : "Return to Home to refresh the queue."}
          </p>
          {session.refreshRecovery === "stale" && (
            <Button onClick={session.retryHomeRefresh} disabled={session.isRefreshing}>
              {session.isRefreshing ? "Refreshing Home…" : "Retry refreshing Home"}
            </Button>
          )}
          <Button variant="secondary" onClick={onAbandon} aria-label="Exit review; abandon review">
            Exit review
          </Button>
        </div>
      ) : session.isSaveError ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="review-session-error">
          <strong>Review couldn&apos;t be saved.</strong>
          <p>Nothing changed. You can retry or exit.</p>
          <div className="review-session-actions">
            <Button onClick={() => rating && session.completeReview(rating)} disabled={!rating}>
              Retry saving review
            </Button>
            <Button
              variant="secondary"
              onClick={onAbandon}
              aria-label="Exit review; abandon review"
            >
              Exit review
            </Button>
          </div>
        </div>
      ) : (
        <section className="review-session-rating" aria-labelledby="rating-title">
          <h2 id="rating-title">How well did you recall this?</h2>
          <RecallRatingSelector
            rating={rating}
            preview={preview}
            disabled={session.isPending}
            onSelect={selectRating}
            onPreview={setPreview}
          />
          <Button
            className="review-session-submit"
            disabled={!rating}
            onClick={() => rating && session.completeReview(rating)}
          >
            Submit rating
          </Button>
        </section>
      )}
    </main>
  );
}
