import fs from "node:fs";
import path from "node:path";

const skippedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "artifacts",
  ".pnpm-store",
]);
const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".yml",
  ".yaml",
]);
const extensionlessTextFiles = new Set([".gitignore", ".gitattributes", ".env.example"]);

function normalizeDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      normalizeDirectory(filePath);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name)) && !extensionlessTextFiles.has(entry.name)) continue;
    const input = fs.readFileSync(filePath, "utf8");
    const output = `${input.replace(/[ \t]+$/gm, "").replace(/\s+$/, "")}\n`;
    if (output !== input) fs.writeFileSync(filePath, output, "utf8");
  }
}

normalizeDirectory(".");
