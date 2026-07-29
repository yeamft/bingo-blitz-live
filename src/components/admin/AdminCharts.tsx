import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminSummary } from "@/lib/api";
import { formatEtb } from "@/lib/admin/format";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

type AdminChartsProps = {
  summary: AdminSummary;
};

function chartTooltipStyle() {
  return {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.75rem",
    color: "hsl(var(--foreground))",
    fontSize: "12px",
  };
}

export function AdminFinancialCharts({ summary }: AdminChartsProps) {
  const financialData = [
    { name: "Deposits", value: summary.totals.total_deposits ?? 0, fill: CHART_COLORS[1] },
    { name: "Withdrawals", value: summary.totals.total_withdrawals ?? 0, fill: CHART_COLORS[4] },
    { name: "Revenue", value: summary.totals.total_revenue, fill: CHART_COLORS[0] },
    { name: "Payouts", value: summary.totals.total_payouts, fill: CHART_COLORS[2] },
  ];

  const roomStatusData = [
    { name: "Live", value: summary.totals.live_rooms },
    { name: "Active", value: (summary.totals.active_rooms ?? 0) - (summary.totals.live_rooms ?? 0) },
    { name: "Paused", value: summary.totals.paused_rooms ?? 0 },
    { name: "Closed", value: summary.totals.closed_rooms ?? 0 },
  ].filter((entry) => entry.value > 0);

  const txByKind = summary.transactions.reduce<Record<string, number>>((acc, tx) => {
    acc[tx.kind] = (acc[tx.kind] ?? 0) + Math.abs(Number(tx.amount));
    return acc;
  }, {});

  const transactionTrend = Object.entries(txByKind)
    .slice(0, 6)
    .map(([kind, amount]) => ({ kind: kind.replace(/_/g, " "), amount }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Financial Overview" description="Deposits, withdrawals, revenue, and payouts">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={financialData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value: number) => formatEtb(value)} contentStyle={chartTooltipStyle()} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {financialData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Room Status" description="Distribution of room lifecycle states">
        {roomStatusData.length === 0 ? (
          <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No room data</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={roomStatusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={92}
                paddingAngle={3}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {roomStatusData.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle()} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Transaction Volume" description="Top transaction types by volume" className="lg:col-span-2">
        {transactionTrend.length === 0 ? (
          <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No transactions yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={transactionTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="kind" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value: number) => formatEtb(value)} contentStyle={chartTooltipStyle()} />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 shadow-card ${className}`}>
      <div className="mb-4 border-b border-border pb-4">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
