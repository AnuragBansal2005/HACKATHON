import path from "path";
import { Request, Response, Router } from "express";
import { callGroq } from "../services/groqClient";
import { enrichWithAI } from "../services/aiEnricher";
import { parseCode } from "../services/codeParser";
import { fetchRepo } from "../services/githubFetcher";
import { buildGraph } from "../services/graphBuilder";
import { findSnapshotByFile, getSnapshot, setSnapshot } from "../services/graphStore";
import { toSnapshot } from "../services/graphTransformer";
import { AnalyzeRequestBody, ChatRequestBody, FileAnalysisRequestBody } from "../types";
import { classifyNode } from "../utils/fileImportance";

const router = Router();

function repoNameFromUrl(repoUrl: string): string {
  const cleaned = repoUrl.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] || "repository";
}

function formatList(values: string[], limit = 12): string {
  const unique = [...new Set(values)].filter(Boolean);
  const shown = unique.slice(0, limit);
  return shown.length > 0 ? shown.join(", ") : "none";
}

function heuristicAnalysis(filePath: string, fileName: string, levelLabel: string, dependencies: string[], usedBy: string[]) {
  return [
    `- **What it does:** ${fileName} sits in the ${levelLabel} tier and likely owns a key part of project behavior.`,
    `- **How it works:** Based on path (${filePath}), it likely coordinates routing, configuration, or feature-specific logic.`,
    `- **Files it connects to:** ${formatList(dependencies)}${usedBy.length > 0 ? `; referenced by ${formatList(usedBy)}` : ""}.`,
    "- **Its role in the system:** It provides architecture signal and helps define execution flow through the graph.",
  ].join("\n");
}

function buildChatSystemPrompt(totalNodes: number, totalEdges: number, criticalFiles: string[], highFiles: string[], selectedNodeName: string) {
  return [
    "You are an intelligent assistant embedded inside a file graph visualization tool.",
    "",
    "You have full awareness of the current project graph:",
    `- Total nodes: ${totalNodes}`,
    `- Total edges: ${totalEdges}`,
    `- Critical files (L1): ${formatList(criticalFiles, 30)}`,
    `- High importance files (L2): ${formatList(highFiles, 30)}`,
    `- Currently selected node: ${selectedNodeName || "none"}`,
    "",
    "Use this context to answer questions about the project structure, file relationships, architecture decisions, and code organization. Be concise, technical, and specific. When referencing files, use their exact names.",
  ].join("\n");
}

router.post("/analyze", async (req: Request<Record<string, never>, Record<string, never>, AnalyzeRequestBody>, res: Response) => {
  const { repoUrl } = req.body;

  if (!repoUrl || typeof repoUrl !== "string") {
    return res.status(400).json({ error: "repoUrl is required" });
  }

  if (!repoUrl.includes("github.com")) {
    return res.status(400).json({ error: "Only GitHub URLs are supported" });
  }

  try {
    let files;
    console.log("[analyze] cloning repository");
    try {
      files = await fetchRepo(repoUrl);
    } catch {
      return res.status(400).json({ error: "Clone failed. Make sure the repo is public and the URL is correct." });
    }

    console.log("[analyze] parsing");
    const parsed = parseCode(files);

    console.log("[analyze] building graph");
    const graph = buildGraph(parsed);

    console.log("[analyze] enriching");
    const enriched = await enrichWithAI(graph);

    const graphId = `g-${Date.now().toString(36)}`;
    const snapshot = toSnapshot(graphId, repoUrl, repoNameFromUrl(repoUrl), enriched);
    setSnapshot(graphId, snapshot);

    return res.json({ graphId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.toLowerCase().includes("rate limit")) {
      return res.status(429).json({ error: message });
    }
    if (message.toLowerCase().includes("authorization")) {
      return res.status(401).json({ error: message });
    }
    if (message.toLowerCase().includes("not found") || message.toLowerCase().includes("inaccessible")) {
      return res.status(404).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

router.get("/graph/:graphId", (req, res) => {
  const snapshot = getSnapshot(req.params.graphId);
  if (!snapshot) {
    return res.status(404).json({ error: "Graph not found" });
  }
  return res.json(snapshot.graph);
});

router.get("/summary", (req, res) => {
  const fileId = String(req.query.fileId || "");
  const graphId = String(req.query.graphId || "");

  if (!fileId) {
    return res.status(400).json({ error: "fileId is required" });
  }

  const snapshot = graphId ? getSnapshot(graphId) : findSnapshotByFile(fileId);
  if (!snapshot) {
    return res.status(404).json({ error: "Graph not found" });
  }

  const summary = snapshot.summaries[fileId];
  if (!summary) {
    return res.status(404).json({ error: "Summary not found" });
  }

  return res.json(summary);
});

router.get("/onboarding/:graphId", (req, res) => {
  const snapshot = getSnapshot(req.params.graphId);
  if (!snapshot) {
    return res.status(404).json({ error: "Graph not found" });
  }
  return res.json(snapshot.onboarding);
});

router.get("/summary/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const graphId = String(req.query.graphId || "");

  if (!fileId) {
    return res.status(400).json({ error: "fileId is required" });
  }

  const snapshot = graphId ? getSnapshot(graphId) : findSnapshotByFile(fileId);
  if (!snapshot) {
    return res.status(404).json({ error: "Graph not found" });
  }

  const summary = snapshot.summaries[fileId];
  if (!summary) {
    return res.status(404).json({ error: "Summary not found" });
  }

  return res.json(summary);
});

router.post("/query", (req: Request<Record<string, never>, Record<string, never>, { graphId?: string; query?: string }>, res: Response) => {
  const graphId = req.body.graphId;
  const query = (req.body.query || "").trim();

  if (!graphId || !query) {
    return res.status(400).json({ error: "graphId and query are required" });
  }

  const snapshot = getSnapshot(graphId);
  if (!snapshot) {
    return res.status(404).json({ error: "Graph not found" });
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9._-]/g, ""))
    .filter(Boolean);

  const scored = snapshot.graph.nodes
    .map((node) => {
      const hay = `${node.label} ${node.path}`.toLowerCase();
      const score = terms.reduce((acc, term) => (hay.includes(term) ? acc + 1 : acc), 0);
      return { id: node.id, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => s.id);

  const highlightedNodeIds = scored.length > 0 ? scored : snapshot.graph.nodes.slice(0, 5).map((n) => n.id);
  const topName = path.basename(highlightedNodeIds[0] || "the graph");

  return res.json({
    highlightedNodeIds,
    explanation: `Matched ${highlightedNodeIds.length} files. Start with ${topName} and follow highlighted dependencies.`,
  });
});

router.post("/file-analysis", async (req: Request<Record<string, never>, Record<string, never>, FileAnalysisRequestBody>, res: Response) => {
  const { graphId, fileId } = req.body;
  if (!graphId || !fileId) {
    return res.status(400).json({ error: "graphId and fileId are required" });
  }

  const snapshot = getSnapshot(graphId);
  if (!snapshot) {
    return res.status(404).json({ error: "Graph not found" });
  }

  const node = snapshot.graph.nodes.find((n) => n.id === fileId);
  if (!node) {
    return res.status(404).json({ error: "File not found" });
  }

  const summary = snapshot.summaries[fileId];
  const importance = classifyNode(node.path);
  const levelLabel = importance.badge ?? "Default";

  const prompt = `You are a code architecture expert. Analyze this file from a software project:

File path: ${node.path}
File name: ${node.label}
Importance Level: ${importance.level} (${levelLabel})

Based on the file path, name, and its role in a typical project structure, provide a concise analysis covering:
1. **What it does** — its primary purpose and responsibility
2. **How it works** — key mechanisms, patterns, or technologies it likely uses
3. **Files it connects to** — what it likely imports from or exports to
4. **Its role in the system** — how critical it is to the overall architecture

Keep the response under 200 words. Use bullet points. Be specific and technical.`;

  try {
    const markdown = await callGroq([{ role: "user", content: prompt }], 1000);
    return res.json({ markdown });
  } catch {
    const markdown = heuristicAnalysis(
      node.path,
      node.label,
      levelLabel,
      summary?.dependencies ?? [],
      summary?.usedBy ?? [],
    );
    return res.json({ markdown });
  }
});

router.post("/chat", async (req: Request<Record<string, never>, Record<string, never>, ChatRequestBody>, res: Response) => {
  const { graphId, messages, selectedNodeId, systemPrompt } = req.body;
  if (!graphId || !Array.isArray(messages)) {
    return res.status(400).json({ error: "graphId and messages are required" });
  }

  const snapshot = getSnapshot(graphId);
  if (!snapshot) {
    return res.status(404).json({ error: "Graph not found" });
  }

  const criticalFiles = snapshot.graph.nodes
    .filter((node) => classifyNode(node.path).level === 1)
    .map((node) => node.label);
  const highFiles = snapshot.graph.nodes
    .filter((node) => classifyNode(node.path).level === 2)
    .map((node) => node.label);
  const selectedNodeName = snapshot.graph.nodes.find((node) => node.id === selectedNodeId)?.label ?? "none";

  const mergedSystemPrompt =
    systemPrompt && systemPrompt.trim().length > 0
      ? systemPrompt
      : buildChatSystemPrompt(
          snapshot.graph.nodes.length,
          snapshot.graph.edges.length,
          criticalFiles,
          highFiles,
          selectedNodeName,
        );

  try {
    const reply = await callGroq(messages, 1000, mergedSystemPrompt);
    return res.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat error";
    console.error("[chat] Groq request failed", message);
    const lastQuestion = messages[messages.length - 1]?.content ?? "";
    return res.json({
      reply: [
        `- **Context:** ${snapshot.graph.nodes.length} files and ${snapshot.graph.edges.length} dependencies loaded.`,
        `- **Selected file:** ${selectedNodeName}.`,
        `- **Question received:** ${lastQuestion}`,
        "- **Next step:** Configure GROQ_API_KEY in backend env for full model-backed responses.",
      ].join("\n"),
    });
  }
});

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
