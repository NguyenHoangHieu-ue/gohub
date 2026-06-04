interface MetricCardProps {
  label:   string
  value:   number
  accent?: "blue" | "green" | "gray"
}

const accents = {
  blue:  "border-t-brand-600",
  green: "border-t-green-500",
  gray:  "border-t-gray-300",
}

export function MetricCard({ label, value, accent = "blue" }: MetricCardProps) {
  return (
    <div className={`bg-white border border-gray-200 border-t-2 ${accents[accent]} rounded-xl px-5 py-4 shadow-sm`}>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-extrabold text-gray-900 tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}
