const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = process.cwd();
const ignoredDirs = new Set([".git", "node_modules"]);
const debounceMs = 1000;
let timer = null;
let pending = false;

function isIgnored(changedPath) {
  if (!changedPath) {
    return false;
  }

  const parts = changedPath.split(path.sep);
  return parts.some((part) => ignoredDirs.has(part));
}

function runGit(args) {
  execFileSync("git", args, { cwd: repoRoot, stdio: "inherit" });
}

function hasChanges() {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return output.trim().length > 0;
}

function commitChanges() {
  if (!hasChanges()) {
    pending = false;
    return;
  }

  runGit(["add", "-A"]);

  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").replace("Z", "");
  runGit(["commit", "-m", `Auto-commit: ${timestamp}`]);
  pending = false;
}

function scheduleCommit() {
  pending = true;
  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    commitChanges();
  }, debounceMs);
}

fs.watch(
  repoRoot,
  { recursive: true },
  (_eventType, filename) => {
    if (!filename || isIgnored(filename)) {
      return;
    }

    scheduleCommit();
  }
);

console.log("Auto-commit watcher running. Press Ctrl+C to stop.");
