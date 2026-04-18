import { ParsedFile, RawFile } from "../types";

function pushMatches(target: Set<string>, content: string, regex: RegExp): void {
  const re = new RegExp(regex.source, regex.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const value = (match[1] || "").trim();
    if (value) target.add(value);
  }
}

function extractImports(content: string): string[] {
  const imports = new Set<string>();

  // JS/TS
  pushMatches(imports, content, /import\s+[^'"\n]*from\s+['"]([^'"]+)['"]/g);
  pushMatches(imports, content, /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);

  // Python
  pushMatches(imports, content, /^\s*from\s+([\w.]+)\s+import\s+[\w.*,\s]+$/gm);
  const pyImport = new RegExp(/^\s*import\s+([\w.,\s]+)$/gm.source, "gm");
  let pyMatch: RegExpExecArray | null;
  while ((pyMatch = pyImport.exec(content)) !== null) {
    pyMatch[1]
      .split(",")
      .map((v) => v.trim().split(/\s+as\s+/i)[0])
      .filter(Boolean)
      .forEach((v) => imports.add(v));
  }

  // Go
  pushMatches(imports, content, /^\s*import\s+"([^"]+)"\s*$/gm);
  const goBlock = new RegExp(/import\s*\(([^)]*)\)/gm.source, "gm");
  let goBlockMatch: RegExpExecArray | null;
  while ((goBlockMatch = goBlock.exec(content)) !== null) {
    pushMatches(imports, goBlockMatch[1], /"([^"]+)"/g);
  }

  // Java / Kotlin
  pushMatches(imports, content, /^\s*import\s+([\w.*]+)\s*;?\s*$/gm);

  // Rust
  pushMatches(imports, content, /^\s*use\s+([^;]+);\s*$/gm);

  // C / C++
  pushMatches(imports, content, /^\s*#include\s*[<"]([^>"]+)[>"]\s*$/gm);

  // Ruby
  pushMatches(imports, content, /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]\s*$/gm);

  // PHP
  pushMatches(imports, content, /^\s*(?:require|require_once|include|include_once)\s*\(?\s*['"]([^'"]+)['"]/gm);
  pushMatches(imports, content, /^\s*use\s+([A-Za-z0-9_\\]+)\s*;\s*$/gm);

  // Swift
  pushMatches(imports, content, /^\s*import\s+([A-Za-z0-9_.]+)\s*$/gm);

  // Generic fallback
  pushMatches(imports, content, /from\s+['"]([^'"]+)['"]/g);
  pushMatches(imports, content, /import\s+['"]([^'"]+)['"]/g);

  return [...imports];
}

export function parseCode(files: RawFile[]): ParsedFile[] {
  return files.map((file) => ({
    path: file.path,
    imports: extractImports(file.content),
    exports: [],
    loc: file.content.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
  }));
}
