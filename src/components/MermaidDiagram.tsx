import { useEffect, useId, useState } from "react";

let mermaidModule: Promise<typeof import("mermaid").default> | undefined;

function loadMermaid() {
  mermaidModule ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, theme: "base", securityLevel: "strict", themeVariables: {
  primaryColor: "#eeeaff",
  primaryTextColor: "#37305b",
  primaryBorderColor: "#c7baff",
  lineColor: "#aaa1cf",
  secondaryColor: "#e6f8f2",
  tertiaryColor: "#fff4e9",
  fontFamily: "DM Sans, sans-serif",
    } });
    return mermaid;
  });
  return mermaidModule;
}

export default function MermaidDiagram({ chart, compact = false }: { chart: string; compact?: boolean }) {
  const generatedId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const source = chart.trim().replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();
    loadMermaid().then(async (mermaid) => {
      await mermaid.parse(source);
      return mermaid.render(`mermaid-${generatedId}`, source);
    }).then(({ svg: rendered }) => {
      if (!cancelled) { setSvg(rendered); setError(""); }
    }).catch((caught: unknown) => {
      if (!cancelled) {
        if (import.meta.env.DEV) console.error("Mermaid diagram rendering failed.", caught);
        setSvg("");
        setError("This diagram could not be rendered. Try simplifying the source text.");
      }
    });
    return () => { cancelled = true; };
  }, [chart, generatedId]);

  if (error) return <div className="diagram-error">{error}</div>;
  if (!svg) return <div className={`diagram-loading ${compact ? "compact" : ""}`}>Building your visual…</div>;
  return <div className={`mermaid-output ${compact ? "compact" : ""}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
