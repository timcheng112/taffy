import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

/** The sole timing configuration for transient Learning Item motion. */
export const LEARNING_ITEM_MOTION = {
  insertionDurationMs: 360,
  insertionEasing: "cubic-bezier(0.22, 1, 0.36, 1)",
  revealDelayMs: 80,
  revealDurationMs: 180,
  highlightDurationMs: 700,
  highlightHoldPercent: 30,
} as const;

export type LearningItemCue = "insertion" | "return";

type MotionStyle = CSSProperties & Record<`--${string}`, string>;

const motionStyle: MotionStyle = {
  "--learning-item-insertion-duration": `${LEARNING_ITEM_MOTION.insertionDurationMs}ms`,
  "--learning-item-insertion-easing": LEARNING_ITEM_MOTION.insertionEasing,
  "--learning-item-insertion-reveal-delay": `${LEARNING_ITEM_MOTION.revealDelayMs}ms`,
  "--learning-item-insertion-reveal-duration": `${LEARNING_ITEM_MOTION.revealDurationMs}ms`,
  "--learning-item-highlight-duration": `${LEARNING_ITEM_MOTION.highlightDurationMs}ms`,
  "--learning-item-highlight-hold": `${LEARNING_ITEM_MOTION.highlightHoldPercent}%`,
};

/** Applies the shared transient cue to an existing row or a newly inserted row. */
export function LearningItemMotion({
  cue,
  onPresented,
  children,
}: {
  cue?: LearningItemCue;
  onPresented?: () => void;
  children: ReactElement<{ className?: string; style?: CSSProperties }>;
}) {
  const [activeCue, setActiveCue] = useState(cue);
  const presentedCue = useRef<LearningItemCue | undefined>(undefined);

  useEffect(() => {
    if (!cue) {
      presentedCue.current = undefined;
      return;
    }
    if (presentedCue.current === cue) return;
    presentedCue.current = cue;
    setActiveCue(cue);
    onPresented?.();
  }, [cue, onPresented]);

  useEffect(() => {
    if (!activeCue) return;
    const duration =
      activeCue === "insertion"
        ? LEARNING_ITEM_MOTION.insertionDurationMs + LEARNING_ITEM_MOTION.highlightDurationMs
        : LEARNING_ITEM_MOTION.highlightDurationMs;
    const timeout = window.setTimeout(() => setActiveCue(undefined), duration);
    return () => window.clearTimeout(timeout);
  }, [activeCue]);

  if (!activeCue) return children;

  const row = cloneElement(children, {
    className: `${children.props.className ?? ""} learning-item-motion-row ${
      activeCue === "insertion" ? "learning-item-inserting" : "learning-item-returning"
    }`,
    style: motionStyle,
  });

  if (activeCue === "return") return <>{row}</>;

  return (
    <div className="learning-item-insertion" style={motionStyle}>
      <div className="learning-item-insertion-content">{row}</div>
    </div>
  );
}
