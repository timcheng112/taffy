import { useEffect, useRef, type ReactNode } from "react";
import { Home, LibraryBig, Settings } from "lucide-react";

export type AppDestination = "home" | "library";

export function AppShell({
  children,
  activeDestination,
  onNavigate,
}: {
  children: ReactNode;
  activeDestination: AppDestination;
  onNavigate: (destination: AppDestination) => void;
}) {
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const containWheelInput = (event: Event) => {
      event.preventDefault();
    };
    const listenerOptions = { passive: false };
    sidebar.addEventListener("wheel", containWheelInput, listenerOptions);

    return () => {
      sidebar.removeEventListener("wheel", containWheelInput);
    };
  }, []);

  return (
    <main className="app-shell">
      <aside className="app-sidebar" ref={sidebarRef}>
        <p className="wordmark">taffy</p>
        <nav aria-label="Primary">
          <a
            className={activeDestination === "home" ? "active" : undefined}
            href="#home"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("home");
            }}
          >
            <Home size={18} aria-hidden="true" />
            Home
          </a>
          <a
            className={activeDestination === "library" ? "active" : undefined}
            href="#library"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("library");
            }}
          >
            <LibraryBig size={18} aria-hidden="true" />
            Library
          </a>
        </nav>
        <a className="settings" href="#settings">
          <Settings size={18} aria-hidden="true" />
          Settings
        </a>
      </aside>
      <section className="app-workspace">{children}</section>
    </main>
  );
}
