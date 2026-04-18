import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Github, Network, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import GraphView from "@/components/GraphView";
import Sidebar from "@/components/Sidebar";
import DetailsPanel from "@/components/DetailsPanel";
import AIDrawer from "@/components/AIDrawer";
import ThemeToggle from "@/components/ThemeToggle";
import { useGraphStore } from "@/store/useGraphStore";

const Dashboard = () => {
  const navigate = useNavigate();
  const graph = useGraphStore((s) => s.graph);

  useEffect(() => {
    if (!graph) navigate("/", { replace: true });
  }, [graph, navigate]);

  if (!graph) return null;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-28 top-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-36 top-8 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-border/80 bg-sidebar/82 px-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-muted-foreground" onClick={() => navigate("/")}>
            <ArrowLeft className="h-3.5 w-3.5" /> New repository
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary shadow-[0_12px_26px_-18px_hsl(var(--primary)/0.75)]">
              <Network className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-mono text-xs font-semibold">CodeMap</span>
          </div>
          <div className="ml-2 hidden items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 font-mono text-[11px] text-muted-foreground md:flex">
            <Github className="h-3 w-3" /> {graph.repoName}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="hidden sm:inline">{graph.nodes.length} files</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{graph.edges.length} dependencies</span>
          <ThemeToggle className="h-7 gap-1.5 border-border bg-secondary/30 px-2" />
          <AIDrawer
            trigger={
              <Button size="sm" className="h-7 gap-1.5 bg-primary px-3 text-primary-foreground shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.75)] ring-1 ring-white/20 hover:bg-primary/95">
                <Sparkles className="h-3.5 w-3.5" /> Ask AI
              </Button>
            }
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="relative min-w-0 flex-1"
        >
          <GraphView />
        </motion.main>

        <DetailsPanel />
      </div>
    </div>
  );
};

export default Dashboard;
