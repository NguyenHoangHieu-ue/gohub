"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SmartBarChartDatum {
  name: string;
  value: number;
}

const Y_AXIS_WIDTH = 92;
const LABEL_MAX_CHARS = 11;

function ellipsisTick(value: string): string {
  return value.length > LABEL_MAX_CHARS ? `${value.slice(0, LABEL_MAX_CHARS)}…` : value;
}

/**
 * YAxis width cố định + tickFormatter ellipsis — né cứng bug v1 s176 (nhãn
 * chữ dài đè lấn cột Recharts). Tooltip đầy đủ tên khi hover.
 */
export function SmartBarChart({ data, color = "#2563eb" }: { data: SmartBarChartDatum[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis
          type="category"
          dataKey="name"
          width={Y_AXIS_WIDTH}
          tick={{ fontSize: 12, fill: "#0f172a" }}
          tickFormatter={ellipsisTick}
        />
        <Tooltip
          formatter={(value) => (typeof value === "number" ? value.toLocaleString("vi-VN") : value)}
        />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
