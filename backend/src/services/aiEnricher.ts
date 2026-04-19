import { Graph, GraphNode } from "../types";
import { callGroq } from "./groqClient";
const MAX_NODES_TO_ENRICH = 6;
const BATCH_SIZE = 2;

async function getSummary(node: GraphNode): Promise<string> {
  const prompt = `You are analyzing a source code file in a GitHub repository.\n\nFile path: ${node.id}\nFile type: ${node.type}\nLines of code: ${node.loc}\nOutgoing dependencies: ${node.dependencyCount}\n\nIn exactly 1-2 sentences, describe what this file most likely does based on its path and role. Be specific and practical. No filler.`;

  return callGroq([{ role: "user", content: prompt }], 120);
}

async function batchEnrich(nodes: GraphNode[]): Promise<void> {
  let hitRateLimit = false;

  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    if (hitRateLimit) {
      break;
    }

    const batch = nodes.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (node) => {
        try {
          node.summary = await getSummary(node);
        } catch (error) {
          const status = (error as { response?: { status?: number } }).response?.status;
          if (status === 429) {
            hitRateLimit = true;
          }
          node.summary = undefined;
        }
      })
    );

    if (i + BATCH_SIZE < nodes.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

export async function enrichWithAI(graph: Graph): Promise<Graph> {
  if (!process.env.GROQ_API_KEY) {
    console.log("[ai] GROQ_API_KEY not set, skipping AI enrichment");
    return graph;
  }

  const topNodes = [...graph.nodes]
    .sort((a, b) => b.dependencyCount - a.dependencyCount)
    .slice(0, MAX_NODES_TO_ENRICH);

  await batchEnrich(topNodes);
  return graph;
}
