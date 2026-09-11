import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { AppShell } from "./AppShell";

const shellStyles = readFileSync("src/shared/styles.css", "utf8");

describe("AppShell scroll ownership", () => {
  it("suppresses overscroll at the whole-app scroll boundary", () => {
    expect(shellStyles).toMatch(/html \{[\s\S]*?overscroll-behavior: none;[\s\S]*?\}/);
    expect(shellStyles).toMatch(/body \{[\s\S]*?overscroll-behavior: none;[\s\S]*?\}/);
  });

  it("keeps the sidebar viewport-height and the workspace on document scroll", () => {
    render(
      <AppShell activeDestination="home" onNavigate={() => {}}>
        <div style={{ minHeight: "200vh" }}>Long page content</div>
      </AppShell>,
    );

    const sidebar = screen.getByRole("complementary");
    const workspace = document.querySelector(".app-workspace");
    expect(workspace).not.toBeNull();
    if (!workspace) throw new Error("AppShell workspace was not rendered");

    expect(sidebar).toHaveClass("app-sidebar");
    expect(shellStyles).toMatch(/\.app-shell aside \{[\s\S]*?align-self: start;/);
    expect(shellStyles).toMatch(/\.app-shell aside \{[\s\S]*?position: sticky;/);
    expect(shellStyles).toMatch(/\.app-shell aside \{[\s\S]*?height: 100vh;/);
    expect(shellStyles).toContain("overflow-x: clip;");
    expect(shellStyles).toContain("overflow-y: visible;");
    expect(workspace).toHaveClass("app-workspace");
  });

  it("contains wheel input over the sidebar without containing workspace input", () => {
    render(
      <AppShell activeDestination="home" onNavigate={() => {}}>
        <div style={{ minHeight: "200vh" }}>Long page content</div>
      </AppShell>,
    );

    const sidebar = screen.getByRole("complementary");
    const workspace = document.querySelector(".app-workspace");
    expect(workspace).not.toBeNull();
    if (!workspace) throw new Error("AppShell workspace was not rendered");

    const sidebarWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    sidebar.dispatchEvent(sidebarWheel);
    expect(sidebarWheel.defaultPrevented).toBe(true);

    const workspaceWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    workspace.dispatchEvent(workspaceWheel);
    expect(workspaceWheel.defaultPrevented).toBe(false);
  });

  it("keeps navigation keyboard reachable while long content remains outside list scroll surfaces", async () => {
    const user = userEvent.setup();
    render(
      <AppShell activeDestination="library" onNavigate={() => {}}>
        <ul className="review-queue-list">
          {Array.from({ length: 40 }, (_, index) => (
            <li className="review-queue-row" key={index}>
              Row {index + 1}
            </li>
          ))}
        </ul>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Home" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Library" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Settings" })).toBeVisible();
    await user.tab();
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Library" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();
    const queue = document.querySelector(".review-queue-list");
    expect(queue).not.toBeNull();
    expect(shellStyles).toMatch(/\.review-queue-list \{[\s\S]*?overflow: hidden;/);
    expect(shellStyles).toMatch(/\.library-list \{[\s\S]*?overflow: hidden;/);
  });
});
