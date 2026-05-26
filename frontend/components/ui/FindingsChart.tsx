"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #334155",
  borderRadius: "6px",
  fontSize: "12px",
};

export function SeverityPieChart({
  data,
}: {
  data: { name: string; value: number; fill: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={52}
          outerRadius={78}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FindingsTrendChart({
  data,
}: {
  data: { date: string; findings: number; resolved?: number }[];
}) {
  const hasResolved = data.some((d) => d.resolved !== undefined);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="findings"
          name="Open"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: "#3b82f6", r: 3 }}
        />
        {hasResolved ? (
          <Line
            type="monotone"
            dataKey="resolved"
            name="Resolved"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ fill: "#10b981", r: 2 }}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SourceBarChart({
  data,
}: {
  data: { source: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid stroke="#1e293b" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="source"
          width={72}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
