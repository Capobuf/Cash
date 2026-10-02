import { Pie, PieChart } from 'recharts';
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
  type ChartConfig,
} from '@/components/ui/chart';
import { eur } from '@/lib/format';

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
    .map((row, index) => ({
      ...row,
      category: `category${index}`,
      value: Number(row.amount),
      fill: `var(--color-category${index})`,
      color:
        index < 5
          ? `var(--chart-${index + 1})`
          : `color-mix(in oklch, var(--chart-${(index % 5) + 1}) 65%, var(--foreground))`,
    }));
  const config: ChartConfig = Object.fromEntries(
    data.map((row) => [row.category, { label: row.name, color: row.color }]),
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <div className="space-y-4">
            <ChartContainer
              config={config}
              className="mx-auto h-72 w-full max-w-96 aspect-auto"
            >
              <PieChart accessibilityLayer>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelKey="category"
                      className="max-w-80 [&>div:first-child]:break-words"
                      formatter={(value) => (
                        <span className="font-mono tabular-nums">
                          {eur(String(value))}
                        </span>
                      )}
                    />
                  }
                />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="category"
                  outerRadius="90%"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              </PieChart>
            </ChartContainer>
            <ul
              aria-label="Importi per categoria"
              className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"
            >
              {data.map((row) => (
                <li key={row.key} className="flex min-w-0 items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">
                    {row.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {eur(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
