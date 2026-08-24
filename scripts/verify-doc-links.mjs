import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const docsRoot = path.join(repoRoot, "Docs");
const skippedTopLevelDirectories = new Set(["archive", "references"]);
const markdownFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const relativePath = path.relative(docsRoot, fullPath);
    const topLevel = relativePath.split(path.sep)[0];

    if (skippedTopLevelDirectories.has(topLevel)) {
      continue;
    }

    if (statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (entry.endsWith(".md")) {
      markdownFiles.push(fullPath);
    }
  }
}

if (!existsSync(docsRoot)) {
  console.log("Docs/ is not present; local documentation link verification skipped.");
  process.exit(0);
}

walk(docsRoot);

const failures = [];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const filePath of markdownFiles) {
  const source = readFileSync(filePath, "utf8");

  for (const match of source.matchAll(linkPattern)) {
    let target = match[1].trim();

    if (!target || target.startsWith("#") || /^(?:https?:|mailto:)/.test(target)) {
      continue;
    }

    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }

    target = target.split("#", 1)[0];

    try {
      target = decodeURIComponent(target);
    } catch {
      failures.push(`${path.relative(docsRoot, filePath)} -> 잘못된 URL 인코딩: ${target}`);
      continue;
    }

    const resolved = path.resolve(path.dirname(filePath), target);
    if (!existsSync(resolved)) {
      failures.push(`${path.relative(docsRoot, filePath)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error("깨진 로컬 문서 링크:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Document link verification passed: ${markdownFiles.length} Markdown files.`);
