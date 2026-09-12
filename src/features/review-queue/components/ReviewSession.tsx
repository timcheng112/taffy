import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../components/ui/button";
import { completeDueReviewCommandError, type RecallRating } from "../commands/types";
import { useCompleteDueReviewMutation } from "../mutations/useCompleteDueReviewMutation";
import { reviewQueueQueryKeys } from "../queries/queryKeys";
import { useHomeReviewQueueQuery } from "../queries/useHomeReviewQueueQuery";

const ratings: Array<{ value: RecallRating; label: string }> = [
  { value: "again", label: "Again" },
  { value: "hard", label: "Hard" },
  { value: "good", label: "Good" },
  { value: "easy", label: "Easy" },
];

type QueueEntry = NonNullable<ReturnType<typeof useHomeReviewQueueQuery>["data"]>[number];

function folderPath(entry: QueueEntry) {
  return [...entry.folder.ancestors, entry.folder].map((folder) => folder.name).join(" / ");
}

export function ReviewSession({
  learningItemId,
  onAbandon,
  onCompleted,
}: {
  learningItemId: number;
  onAbandon: () => void;
  onCompleted: () => void;
}) {
  const queue = useHomeReviewQueueQuery();
  const entry = queue.data?.find((item) => item.learningItemId === learningItemId);
  const mutation = useCompleteDueReviewMutation();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState<RecallRating | null>(null);
  const [preview, setPreview] = useState<RecallRating | null>(null);
  const [refreshRecovery, setRefreshRecovery] = useState<"completion" | "stale" | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isMissingEntry = queue.isFetched && !entry;
  const pending = mutation.isPending;
  const commandError = completeDueReviewCommandError(mutation.error);
  const stale = commandError?.code === "review_not_eligible";

  useEffect(() => {
    if (mutation.isError || refreshRecovery !== null || isMissingEntry) errorRef.current?.focus();
  }, [isMissingEntry, mutation.isError, refreshRecovery]);

  useEffect(() => {
    if (entry) titleRef.current?.focus();
  }, [entry]);

  async function refreshHomeQueue(recovery: "completion" | "stale") {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries(
        { queryKey: reviewQueueQueryKeys.home() },
        { throwOnError: true },
      );
      setRefreshRecovery(null);
      if (recovery === "completion") onCompleted();
    } catch {
      setRefreshRecovery(recovery);
    } finally {
      setIsRefreshing(false);
    }
  }

  function save(selectedRating: RecallRating) {
    if (pending) return;
    mutation.mutate(
      { learningItemId, rating: selectedRating },
      {
        onSuccess: () => void refreshHomeQueue("completion"),
        onError: (error) => {
          if (completeDueReviewCommandError(error)?.code === "review_not_eligible") {
            void refreshHomeQueue("stale");
          }
        },
      },
    );
  }

  function selectRating(nextRating: RecallRating) {
    if (pending) return;
    setRating(nextRating);
    setPreview(nextRating);
  }

  if (!entry) {
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

  const displayedRating = preview ?? rating;
  const displayedLabel = ratings.find((item) => item.value === displayedRating)?.label;
  const filledThrough = displayedRating
    ? ratings.findIndex((item) => item.value === displayedRating)
    : -1;

  return (
    <main className="review-session" aria-labelledby="review-session-title">
      <button
        className="review-session-exit"
        type="button"
        disabled={pending}
        onClick={onAbandon}
        aria-label="Exit review; abandon review"
      >
        Exit review
      </button>
      <div className="review-session-context-group">
        <p className="eyebrow">REVIEW SESSION</p>
        <p className="review-session-context">Due Review · {folderPath(entry)}</p>
        <h1 id="review-session-title" ref={titleRef} tabIndex={-1}>
          {entry.title}
        </h1>
      </div>
      {pending ? (
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
      ) : refreshRecovery === "completion" ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="review-session-error">
          <strong>Review saved, but Home couldn&apos;t refresh.</strong>
          <p>The review was recorded. Refresh Home to confirm the updated queue.</p>
          <Button onClick={() => void refreshHomeQueue("completion")} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing Home…" : "Retry refreshing Home"}
          </Button>
        </div>
      ) : stale ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="review-session-error">
          <strong>This Due Review is no longer available.</strong>
          <p>
            {refreshRecovery === "stale"
              ? "Home couldn't refresh the queue. Retry the refresh before returning."
              : "Return to Home to refresh the queue."}
          </p>
          {refreshRecovery === "stale" && (
            <Button onClick={() => void refreshHomeQueue("stale")} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing Home…" : "Retry refreshing Home"}
            </Button>
          )}
          <Button variant="secondary" onClick={onAbandon} aria-label="Exit review; abandon review">
            Exit review
          </Button>
        </div>
      ) : mutation.isError ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="review-session-error">
          <strong>Review couldn&apos;t be saved.</strong>
          <p>Nothing changed. You can retry or exit.</p>
          <div className="review-session-actions">
            <Button onClick={() => rating && save(rating)} disabled={!rating}>
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
          <fieldset className="review-session-star-group">
            <legend className="sr-only">Recall rating</legend>
            <div className="review-session-rating-row">
              <div
                className="review-session-stars"
                onMouseLeave={() => setPreview(rating)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setPreview(rating);
                }}
              >
                {ratings.map((item, index) => (
                  <span
                    className="review-session-star-option"
                    key={item.value}
                    onMouseEnter={() => setPreview(item.value)}
                  >
                    <input
                      id={`recall-rating-${item.value}`}
                      className="review-session-star-input"
                      type="radio"
                      name="recall-rating"
                      value={item.value}
                      checked={rating === item.value}
                      aria-label={`Rate recall: ${item.label}, ${index + 1} of 4`}
                      onFocus={() => setPreview(item.value)}
                      onChange={() => selectRating(item.value)}
                    />
                    <label className="review-session-star" htmlFor={`recall-rating-${item.value}`}>
                      <Star
                        aria-hidden="true"
                        fill={index <= filledThrough ? "currentColor" : "none"}
                        size={28}
                        strokeWidth={1.8}
                      />
                    </label>
                  </span>
                ))}
              </div>
              <p className="review-session-rating-label" aria-live="polite">
                {displayedLabel ?? "Choose a rating"}
              </p>
            </div>
          </fieldset>
          <Button
            className="review-session-submit"
            disabled={!rating}
            onClick={() => rating && save(rating)}
          >
            Submit rating
          </Button>
        </section>
      )}
    </main>
  );
}
