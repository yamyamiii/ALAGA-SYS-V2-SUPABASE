import fs from "node:fs";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  OFFICIAL_LOGO_ALT,
  OFFICIAL_LOGO_PATH,
  OfficialLogo,
} from "@/components/common/OfficialLogo";
import { Brand } from "@/components/layout/Brand";

const read = (path) => fs.readFileSync(path, "utf8");

describe("official ALAGA-SYS branding", () => {
  it("uses the official asset with accessible, aspect-safe rendering", () => {
    render(<OfficialLogo className="h-12 w-12" />);

    const logo = screen.getByAltText(OFFICIAL_LOGO_ALT);
    expect(OFFICIAL_LOGO_PATH).toBe("/alaga-logo.png");
    expect(logo).toHaveAttribute("src", "/alaga-logo.png");
    expect(logo).toHaveClass("object-contain");
    expect(fs.existsSync("public/alaga-logo.png")).toBe(true);
  });

  it("shows an accessible visual fallback when the image cannot load", () => {
    render(<OfficialLogo />);
    fireEvent.error(screen.getByAltText(OFFICIAL_LOGO_ALT));

    expect(
      screen.getByRole("img", { name: OFFICIAL_LOGO_ALT }),
    ).toHaveAttribute("data-logo-fallback");
  });

  it("integrates the logo and official text in the sidebar brand", () => {
    render(<Brand />);

    expect(screen.getByAltText(OFFICIAL_LOGO_ALT)).toBeInTheDocument();
    expect(screen.getByText("ALAGA-SYS")).toBeInTheDocument();
    expect(screen.getByText("BARANGAY HEALTHCARE")).toBeInTheDocument();
    expect(read("src/components/layout/Sidebar.jsx")).toMatch(/<Brand/);
  });

  it("uses the official logo on login, auth loading, and report printing", () => {
    expect(read("src/pages/LoginPage.jsx")).toMatch(/<OfficialLogo/);
    expect(read("src/features/auth/AuthLoadingScreen.jsx")).toMatch(/<Brand/);
    expect(read("src/features/reports/ReportsPage.jsx")).toMatch(
      /print-only[\s\S]*<OfficialLogo/,
    );
  });

  it("uses the official asset as favicon and removes the placeholder", () => {
    expect(read("index.html")).toMatch(
      /<link rel="icon" type="image\/png" href="\/alaga-logo\.png" \/>/,
    );

    const interfaceSource = [
      read("src/pages/LoginPage.jsx"),
      read("src/components/layout/Brand.jsx"),
      read("src/features/auth/AuthLoadingScreen.jsx"),
    ].join("\n");
    expect(interfaceSource).not.toMatch(/>\s*LOGO\s*</);
  });
});
