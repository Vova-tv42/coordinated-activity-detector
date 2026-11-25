'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoordinationGraphData, CoordinationGraphLink } from '@/lib/coordination-graph';

const GRAPH_HEIGHT_PX = 420;
const LINK_WIDTH_SCALE = 5;

const ForceGraph2D = dynamic(
  () =>
    import('react-force-graph-2d') as Promise<{
      default: React.ComponentType<{
        graphData: CoordinationGraphData;
        width: number;
        height: number;
        nodeAutoColorBy: string;
        nodeLabel: string;
        linkWidth: (link: CoordinationGraphLink) => number;
        linkLabel: (link: CoordinationGraphLink) => string;
      }>;
    }>,
  { ssr: false },
);

type CoordinationGraphProps = {
  graphData: CoordinationGraphData;
};

function formatLinkLabel(link: CoordinationGraphLink) {
  return `Скор: ${link.value.toFixed(2)}`;
}

function calculateLinkWidth(link: CoordinationGraphLink) {
  return link.value * LINK_WIDTH_SCALE;
}

export function CoordinationGraph({ graphData }: CoordinationGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setContainerWidth(Math.floor(container.getBoundingClientRect().width));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const hasMeasuredWidth = containerWidth > 0;
  // ForceGraph2D mutates node/link objects in place during simulation
  const clonedGraphData = useMemo(
    () => ({
      nodes: graphData.nodes.map((node) => ({ ...node })),
      links: graphData.links.map((link) => ({ ...link })),
    }),
    [graphData],
  );

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      {hasMeasuredWidth ? (
        <ForceGraph2D
          graphData={clonedGraphData}
          width={containerWidth}
          height={GRAPH_HEIGHT_PX}
          nodeAutoColorBy="group"
          nodeLabel="name"
          linkWidth={calculateLinkWidth}
          linkLabel={formatLinkLabel}
        />
      ) : (
        <div className="flex h-[420px] items-center justify-center text-muted-foreground">
          Завантаження графа...
        </div>
      )}
    </div>
  );
}
