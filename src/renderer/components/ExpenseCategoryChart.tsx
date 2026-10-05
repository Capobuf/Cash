import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { eur } from '@/lib/format';

const compactEuro = (value: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(value);

export function ExpenseCategoryChart({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: { key: string; name: string; amount: string }[];
  empty: string;
}) {
  const data = rows
    .filter((row) => Number(row.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .map((row) => ({
      ...row,
      value: Number(row.amount),
    }));

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <ChartContainer
            config={{ value: { label: 'Importo', color: 'var(--chart-4)' } }}
            className="w-full aspect-auto"
            style={{ height: Math.max(220, data.length * 46 + 36) }}
          >
            <BarChart
              accessibilityLayer
              layout="vertical"
              data={data}
              margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={compactEuro}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="key"
                type="category"
                width={135}
                interval={0}
                tickLine={false}
                axisLine={false}
                tickFormatter={(key) => {
                  const name = data.find((row) => row.key === key)?.name ?? '';
                  return name.length > 20 ? `${name.slice(0, 19)}…` : name;
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="max-w-80 [&>div:first-child]:whitespace-normal"
                    labelFormatter={(_label, payload) =>
                      payload[0]?.payload?.name
                    }
                    formatter={(value) => (
                      <span className="tabular-nums">{eur(String(value))}</span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="value"
                fill="var(--color-value)"
                radius={3}
                maxBarSize={22}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>Nessuna uscita da rappresentare</EmptyTitle>
              <EmptyDescription>{empty}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
