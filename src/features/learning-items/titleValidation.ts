import { z } from "zod";

export const maxLearningItemTitleLength = 120;
const titleTooLongMessage = `Keep Learning Item titles to ${maxLearningItemTitleLength} characters or fewer.`;

export function learningItemTitleLength(value: string) {
  return Array.from(value.trim()).length;
}

export const learningItemTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a Learning Item title.")
    .refine(
      (value) => learningItemTitleLength(value) <= maxLearningItemTitleLength,
      titleTooLongMessage,
    ),
});

export type LearningItemTitleValues = z.infer<typeof learningItemTitleSchema>;
