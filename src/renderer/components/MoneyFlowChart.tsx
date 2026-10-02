import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layer, Rectangle, Sankey, Text, type SankeyNodeProps } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { eur } from '@/lib/format';

function FlowNode({ x, y, width, height, payload }: SankeyNodeProps) {
  const terminal = !payload.targetNodes.length;
  const labelX = terminal ? x - 8 : x + width + 8;
  return (
    <Layer aria-label={`${payload.name}: ${eur(String(payload.value))}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--chart-1)"
      />
      <Text
        x={labelX}
        y={y + height / 2 - 8}
        width={155}
        maxLines={2}
        textAnchor={terminal ? 'end' : 'start'}
        verticalAnchor="middle"
        fill="var(--foreground)"
        fontSize={12}
      >
        {payload.name}
      </Text>
      <Text
        x={labelX}
        y={y + height / 2 + 20}
        textAnchor={terminal ? 'end' : 'start'}
        fill="var(--muted-foreground)"
        fontSize={11}
      >
        {eur(String(payload.value))}
      </Text>
    </Layer>
  );
}

type HoveredFlow = { name: string; value: number; x: number; y: number };

function FlowTooltip({ item }: { item: HoveredFlow }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState({ x: item.x, y: item.y });
  const [size, setSize] = useState({ width: 280, height: 80 });
  useLayoutEffect(() => {
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds) setSize({ width: bounds.width, height: bounds.height });
  }, [item.name, item.value]);
  useEffect(() => {
    const move = (event: PointerEvent) =>
      setPointer({ x: event.clientX, y: event.clientY });
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const left = Math.max(
    8,
    Math.min(pointer.x + 14, window.innerWidth - size.width - 8),
  );
  const top = Math.max(
    8,
    pointer.y + size.height + 14 <= window.innerHeight - 8
      ? pointer.y + 14
      : pointer.y - size.height - 14,
  );
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-max max-w-[min(280px,calc(100vw-16px))] space-y-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      style={{ left, top }}
    >
      <p className="break-words">{item.name}</p>
      <p className="font-semibold tabular-nums">{eur(String(item.value))}</p>
    </div>,
    document.fullscreenElement ?? document.body,
  );
}

export function MoneyFlowChart({
  flow,
  label,
  height = 480,
  layoutHeight = height,
  minWidth = 1120,
  nodePadding = 52,
}: {
  flow: {
    nodes: { name: string }[];
    links: { source: number; target: number; value: number }[];
  };
  label: string;
  height?: number;
  layoutHeight?: number;
  minWidth?: number;
  nodePadding?: number;
}) {
  const [hovered, setHovered] = useState<HoveredFlow>();
  useEffect(() => {
    const clear = () => setHovered(undefined);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
    };
  }, []);
  return (
    <div
      className="overflow-auto"
      style={{ maxHeight: height }}
      onPointerLeave={() => setHovered(undefined)}
      onScroll={() => setHovered(undefined)}
    >
      <ChartContainer
        config={{}}
        className="w-full aspect-auto"
        style={{ height: layoutHeight, minWidth }}
        role="img"
        aria-label={label}
      >
        <Sankey
          data={flow}
          node={FlowNode}
          nodeWidth={12}
          nodePadding={nodePadding}
          sort={false}
          align="left"
          margin={{ top: 24, bottom: 24, left: 8, right: 8 }}
          link={{ stroke: 'var(--chart-1)', strokeOpacity: 0.18 }}
          onMouseEnter={(item, _type, event) => {
            const payload = item.payload;
            const name =
              'source' in payload
                ? `${payload.source.name} → ${payload.target.name}`
                : payload.name;
            setHovered({
              name,
              value: payload.value,
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onMouseLeave={() => setHovered(undefined)}
        />
      </ChartContainer>
      {hovered ? (
        <FlowTooltip key={`${hovered.name}:${hovered.value}`} item={hovered} />
      ) : null}
    </div>
  );
}
