import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import tmp from "tmp";
import { RawFile } from "../types";

const MAX_FILES = 300;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "build",
  ".next",
  "vendor",
  "__pycache__",
  ".cache",
  "coverage",
]);

tmp.setGracefulCleanup();

function normalizeGitHubUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error("Repository URL is required.");

  const sshMatch = url.match(/^git@github\.com:([^/\s]+)\/([^\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}.git`;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new Error("Only GitHub URLs are supported.");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid GitHub URL. Expected: github.com/owner/repo");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  return `https://github.com/${owner}/${repo}.git`;
}

function createTempDir(): Promise<{ dirPath: string; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    tmp.dir({ unsafeCleanup: true }, (err, dirPath, cleanup) => {
      if (err) return reject(err);
      resolve({ dirPath, cleanup });
    });
  });
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

async function walkAndRead(root: string, current: string, out: RawFile[]): Promise<void> {
  if (out.length >= MAX_FILES) return;

  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;

    const fullPath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkAndRead(root, fullPath, out);
      continue;
    }

    if (!entry.isFile()) continue;

    try {
      const buffer = await fs.readFile(fullPath);
      if (isBinary(buffer)) continue;

      const relative = path.relative(root, fullPath).replace(/\\/g, "/");
      out.push({ path: relative, content: buffer.toString("utf8") });
    } catch {
      // Ignore unreadable files.
    }
  }
}

export async function fetchRepo(repoUrl: string): Promise<RawFile[]> {
  const normalizedUrl = normalizeGitHubUrl(repoUrl);
  const { dirPath, cleanup } = await createTempDir();
  const cloneDir = path.join(dirPath, "repo");

  try {
    await simpleGit().clone(normalizedUrl, cloneDir, ["--depth", "1"]);

    const files: RawFile[] = [];
    await walkAndRead(cloneDir, cloneDir, files);
    return files;
  } finally {
    cleanup();
  }
}
