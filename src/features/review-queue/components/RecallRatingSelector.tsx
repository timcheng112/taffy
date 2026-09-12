import { Star } from "lucide-react";
import type { RecallRating } from "../commands/types";

const ratings: Array<{ value: RecallRating; label: string }> = [
  { value: "again", label: "Again" },
  { value: "hard", label: "Hard" },
  { value: "good", label: "Good" },
  { value: "easy", label: "Easy" },
];

export function RecallRatingSelector({
  rating,
  preview,
  disabled,
  onSelect,
  onPreview,
}: {
  rating: RecallRating | null;
  preview: RecallRating | null;
  disabled: boolean;
  onSelect: (rating: RecallRating) => void;
  onPreview: (rating: RecallRating | null) => void;
}) {
  const displayedRating = preview ?? rating;
  const displayedLabel = ratings.find((item) => item.value === displayedRating)?.label;
  const filledThrough = displayedRating
    ? ratings.findIndex((item) => item.value === displayedRating)
    : -1;

  return (
    <fieldset className="review-session-star-group" disabled={disabled}>
      <legend className="sr-only">Recall rating</legend>
      <div className="review-session-rating-row">
        <div
          className="review-session-stars"
          onMouseLeave={() => onPreview(rating)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) onPreview(rating);
          }}
        >
          {ratings.map((item, index) => (
            <span
              className="review-session-star-option"
              key={item.value}
              onMouseEnter={() => onPreview(item.value)}
            >
              <input
                id={`recall-rating-${item.value}`}
                className="review-session-star-input"
                type="radio"
                name="recall-rating"
                value={item.value}
                checked={rating === item.value}
                aria-label={`Rate recall: ${item.label}, ${index + 1} of 4`}
                onFocus={() => onPreview(item.value)}
                onChange={() => onSelect(item.value)}
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
  );
}
