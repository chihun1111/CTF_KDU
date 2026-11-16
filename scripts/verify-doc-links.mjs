import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const markdownFiles = [];
const failures = [];

function walk(directory, skippedDirectories = new Set()) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && /\.md$/i.test(entry.name)) markdownFiles.push(fullPath);
  }
}

const readme = path.join(repoRoot, "README.md");
if (existsSync(readme)) markdownFiles.push(readme);
else failures.push("Missing required documentation: README.md");

for (const directory of ["docs", "Docs"]) {
  const fullPath = path.join(repoRoot, directory);
  if (existsSync(fullPath)) {
    // Private archival/reference material was never part of the active-doc gate.
    walk(fullPath, directory === "Docs" ? new Set(["archive", "references"]) : new Set());
  }
}

function withoutCode(source) {
  let fence = null;
  return source.split(/\r?\n/).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
      }
      return "";
    }
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      return "";
    }
    return line;
  }).join("\n").replace(/(`+)[\s\S]*?\1/g, "");
}

function checkTarget(filePath, rawTarget) {
  let target = rawTarget.startsWith("<") ? rawTarget.slice(1, -1) : rawTarget;
  target = target.replace(/\\([\\()[\] ])/g, "$1");
  if (!target || target.startsWith("#") || target.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(target)) return;
  target = target.split(/[?#]/, 1)[0];
  if (!target) return;
  try {
    target = decodeURIComponent(target);
  } catch {
    failures.push(`${path.relative(repoRoot, filePath)} -> 잘못된 URL 인코딩: ${target}`);
    return;
  }

  const resolved = target.startsWith("/")
    ? path.resolve(repoRoot, `.${target}`)
    : path.resolve(path.dirname(filePath), target);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    failures.push(`${path.relative(repoRoot, filePath)} -> 저장소 밖의 경로: ${target}`);
  } else if (!existsSync(resolved)) {
    failures.push(`${path.relative(repoRoot, filePath)} -> ${target}`);
  }
}

// Inline links/images, optional titles, escaped characters, and parenthesized filenames.
const inlineLinkPattern = /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:\\.|[^\s()\\]|\([^()\n]*\))+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g;
const referencePattern = /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm;

for (const filePath of markdownFiles) {
  const source = withoutCode(readFileSync(filePath, "utf8"));
  for (const pattern of [inlineLinkPattern, referencePattern]) {
    for (const match of source.matchAll(pattern)) checkTarget(filePath, match[1]);
  }
}

if (failures.length > 0) {
  console.error("깨진 로컬 문서 링크:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Document link verification passed: ${markdownFiles.length} Markdown files (README.md, docs/, optional Docs/).`);
