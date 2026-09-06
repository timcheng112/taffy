import { LibraryBig } from "lucide-react";
import type { ReactNode } from "react";

export function LibraryEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-library">
      <LibraryBig size={28} aria-hidden="true" />
      <p>{title}</p>
      <p className="empty-library-copy">{description}</p>
      {action}
    </div>
  );
}
