import axios from "axios";
import simpleGit from "simple-git";
import AdmZip from "adm-zip";
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

  type GitHubRepoInfo = {
    owner: string;
    repo: string;
    cloneUrl: string;
  };

function parseGitHubUrl(input: string): GitHubRepoInfo {
  let url = input.trim();
  if (!url) throw new Error("Repository URL is required.");

  const sshMatch = url.match(/^git@github\.com:([^/\s]+)\/([^\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2].replace(/\.git$/i, "");
    return {
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
    };
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
  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function shouldSkipEntry(relativePath: string): boolean {
  const parts = relativePath.split("/");
  return parts.some((part) => SKIP_DIRS.has(part));
}

function normalizeZipPath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, "/");
  const firstSlash = normalized.indexOf("/");
  if (firstSlash < 0) return "";
  return normalized.slice(firstSlash + 1);
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const { data } = await axios.get<{ default_branch?: string }>(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "reponav-backend",
    },
    timeout: 12000,
  });

  if (!data.default_branch) {
    throw new Error("Could not resolve repository default branch.");
  }

  return data.default_branch;
}

async function fetchFromGitHubZip(owner: string, repo: string): Promise<RawFile[]> {
  const defaultBranch = await getDefaultBranch(owner, repo);
  const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${defaultBranch}`;
  const { data } = await axios.get<ArrayBuffer>(zipUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
  });

  const zip = new AdmZip(Buffer.from(data));
  const entries = zip.getEntries();
  const files: RawFile[] = [];

  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;
    if (entry.isDirectory) continue;

    const relative = normalizeZipPath(entry.entryName);
    if (!relative) continue;
    if (shouldSkipEntry(relative)) continue;

    const buffer = entry.getData();
    if (!buffer || buffer.length === 0) continue;
    if (isBinary(buffer)) continue;

    files.push({
      path: relative,
      content: buffer.toString("utf8"),
    });
  }

  return files;
}

export async function fetchRepo(repoUrl: string): Promise<RawFile[]> {
  const repoInfo = parseGitHubUrl(repoUrl);

  try {
    return await fetchFromGitHubZip(repoInfo.owner, repoInfo.repo);
  } catch {
    // Fallback for local/dev environments where git clone can still succeed.
    const tmp = await import("tmp");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    tmp.setGracefulCleanup();
    const createTempDir = (): Promise<{ dirPath: string; cleanup: () => void }> =>
      new Promise((resolve, reject) => {
        tmp.dir({ unsafeCleanup: true }, (err, dirPath, cleanup) => {
          if (err) return reject(err);
          resolve({ dirPath, cleanup });
        });
      });

    const walkAndRead = async (root: string, current: string, out: RawFile[]): Promise<void> => {
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
        const buffer = await fs.readFile(fullPath);
        if (isBinary(buffer)) continue;
        const relative = path.relative(root, fullPath).replace(/\\/g, "/");
        out.push({ path: relative, content: buffer.toString("utf8") });
      }
    };

    const { dirPath, cleanup } = await createTempDir();
    const cloneDir = path.join(dirPath, "repo");

    try {
      await simpleGit().clone(repoInfo.cloneUrl, cloneDir, ["--depth", "1"]);
      const files: RawFile[] = [];
      await walkAndRead(cloneDir, cloneDir, files);
      return files;
    } finally {
      cleanup();
    }
  }
}
