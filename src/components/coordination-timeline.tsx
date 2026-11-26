'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatChartTime, formatDateTime } from '@/lib/format';

const SCORE_AXIS_DOMAIN = [0, 1];

const timelineChartConfig = {
  maxScore: { label: 'Максимальний скор', color: 'var(--chart-2)' },
  flaggedParticipants: { label: 'Учасників у групах', color: 'var(--chart-4)' },
} satisfies ChartConfig;

export type CoordinationTimelinePoint = {
  windowEnd: string;
  maxScore: number;
  flaggedParticipants: number;
};

type CoordinationTimelineProps = {
  timeline: CoordinationTimelinePoint[];
};

export function CoordinationTimeline({ timeline }: CoordinationTimelineProps) {
  return (
    <ChartContainer config={timelineChartConfig} className="h-72 w-full">
      <LineChart accessibilityLayer data={timeline}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="windowEnd"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={formatChartTime}
        />
        <YAxis yAxisId="score" domain={SCORE_AXIS_DOMAIN} tickLine={false} axisLine={false} />
        <YAxis
          yAxisId="participants"
          orientation="right"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => formatDateTime(payload[0]?.payload.windowEnd)}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          yAxisId="score"
          dataKey="maxScore"
          type="linear"
          stroke="var(--color-maxScore)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="participants"
          dataKey="flaggedParticipants"
          type="linear"
          stroke="var(--color-flaggedParticipants)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
