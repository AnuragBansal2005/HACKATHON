export type ImportanceLevel = 0 | 1 | 2 | 3;

export interface ImportanceInfo {
  level: ImportanceLevel;
  badge: string | null;
  colors: {
    bg: string;
    border: string;
    glow: string;
    bar: string;
    opacity: number;
  };
  size: number;
}

const levelMap: Record<ImportanceLevel, ImportanceInfo> = {
  0: {
    level: 0,
    badge: null,
    colors: {
      bg: "#1A1A2E",
      border: "#555555",
      glow: "rgba(85, 85, 85, 0.25)",
      bar: "#555555",
      opacity: 1,
    },
    size: 1,
  },
  1: {
    level: 1,
    badge: "L1 Core",
    colors: {
      bg: "#0A1B2D",
      border: "#38BDF8",
      glow: "rgba(56, 189, 248, 0.32)",
      bar: "#38BDF8",
      opacity: 1,
    },
    size: 1.5,
  },
  2: {
    level: 2,
    badge: "L2 Standard",
    colors: {
      bg: "#2D1C0A",
      border: "#FFB35C",
      glow: "rgba(255, 179, 92, 0.3)",
      bar: "#FFB35C",
      opacity: 1,
    },
    size: 1,
  },
  3: {
    level: 3,
    badge: "L3 Misc",
    colors: {
      bg: "#0A2D12",
      border: "#30D158",
      glow: "rgba(48, 209, 88, 0.2)",
      bar: "#30D158",
      opacity: 0.7,
    },
    size: 0.75,
  },
};

const normalize = (input: string) => input.replace(/\\/g, "/").toLowerCase().trim();

function includesAny(target: string, tokens: string[]): boolean {
  return tokens.some((token) => target.includes(token));
}

function isInFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`) || path.includes(`/${folder}/`);
}

const l1NameTokens = ["graph", "parse", "api", "route", "server", "app", "main", "index", "config", "vite", "tailwind", "tsconfig", "env"];
const l2NameTokens = ["eslint", "postcss", "vitest", "lint", "test", "spec", "package", "lock", "favicon", "asset", "static", "public"];
const l3NameTokens = ["gitignore", "debug", "planning", "temp", "backup"];

export function classifyNode(filePath: string): ImportanceInfo {
  const normalized = normalize(filePath);
  const fileName = normalized.split("/").pop() ?? normalized;

  if (
    isInFolder(normalized, "backend") ||
    isInFolder(normalized, "src") ||
    fileName === "readme.md" ||
    includesAny(fileName, l1NameTokens)
  ) {
    return levelMap[1];
  }

  if (
    fileName === "eslint.config.js" ||
    fileName === "postcss.config.js" ||
    fileName === "vitest.config.ts" ||
    fileName === "components.json" ||
    fileName === "package.json" ||
    fileName === "package-lock.json" ||
    fileName === "bun.lock" ||
    fileName === "bun.lockb" ||
    fileName === "vite.config.ts" ||
    fileName === "tailwind.config.ts" ||
    fileName === "index.html" ||
    fileName === ".env" ||
    fileName === ".env.example" ||
    /^tsconfig.*\.json$/.test(fileName) ||
    isInFolder(normalized, "public") ||
    includesAny(fileName, l2NameTokens)
  ) {
    return levelMap[2];
  }

  if (
    fileName === ".gitignore" ||
    isInFolder(normalized, ".planning") ||
    isInFolder(normalized, "debug") ||
    includesAny(fileName, l3NameTokens)
  ) {
    return levelMap[3];
  }

  return levelMap[0];
}
