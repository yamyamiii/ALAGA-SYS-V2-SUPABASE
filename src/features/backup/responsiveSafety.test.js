// @vitest-environment node

import fs from "node:fs";

import { describe, expect, it } from "vitest";

const dialog = fs.readFileSync("src/components/ui/dialog.jsx", "utf8");
const sheet = fs.readFileSync("src/components/ui/sheet.jsx", "utf8");
const shell = fs.readFileSync("src/components/layout/AppShell.jsx", "utf8");
const mobileNavigation = fs.readFileSync(
  "src/components/layout/MobileNavigation.jsx",
  "utf8",
);
const aiLauncher = fs.readFileSync(
  "src/features/ai-assistant/FloatingAiAssistant.jsx",
  "utf8",
);
const globalStyles = fs.readFileSync("src/styles/globals.css", "utf8");

describe("cross-device shared UI safety", () => {
  it("uses dynamic viewport and safe-area aware scrollable dialogs", () => {
    expect(dialog).toMatch(/viewport-dialog/);
    expect(dialog).toMatch(/overflow-y-auto/);
    expect(dialog).toMatch(/overscroll-contain/);
    expect(globalStyles).toMatch(/max-height: calc\(100vh - 1rem\)/);
    expect(globalStyles).toMatch(/100dvh/);
    expect(globalStyles).toMatch(/safe-area-inset-top/);
    expect(globalStyles).toMatch(/safe-area-inset-bottom/);
  });

  it("keeps the mobile drawer inside the dynamic viewport with reachable controls", () => {
    expect(sheet).toMatch(/h-dvh/);
    expect(sheet).toMatch(/max-w-\[calc\(100%-2\.5rem\)\]/);
    expect(sheet).toMatch(/h-10 w-10 touch-manipulation/);
    expect(mobileNavigation).toMatch(/overflow-y-auto/);
    expect(mobileNavigation).toMatch(/safe-area-inset-bottom/);
  });

  it("prevents route overflow and keeps the AI launcher below dialog overlays", () => {
    expect(shell).toMatch(/min-w-0 overflow-x-clip/);
    expect(globalStyles).toMatch(/overflow-x-hidden/);
    expect(aiLauncher).toMatch(/fixed bottom-20 right-4 z-40/);
    expect(dialog).toMatch(/z-50/);
  });
});
