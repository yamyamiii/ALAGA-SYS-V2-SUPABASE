import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const USER_INTERFACE_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
]);

function collectInterfaceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectInterfaceFiles(entryPath);
    if (entry.name.includes(".test.")) return [];
    return USER_INTERFACE_EXTENSIONS.has(path.extname(entry.name))
      ? [entryPath]
      : [];
  });
}

describe("public branding", () => {
  it("keeps the internal V2 version out of all user-interface source", () => {
    const interfaceFiles = ["index.html", ...collectInterfaceFiles("src")];
    const interfaceSource = interfaceFiles
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    expect(interfaceSource).not.toMatch(/ALAGA-SYS\s+V2/i);
  });

  it("keeps internal phase numbers out of user-facing source", () => {
    const interfaceFiles = ["index.html", ...collectInterfaceFiles("src")];
    const interfaceSource = interfaceFiles
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    expect(interfaceSource).not.toMatch(/\bPhase\s+\d+[A-Z]?\b/i);
  });
});
