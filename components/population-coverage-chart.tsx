"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import type { PopulationSummary } from "@/lib/population-overlay";

const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="h-[220px]" role="status">Memuat grafik…</div>,
});

export default function PopulationCoverageChart({ population, label }: { population: PopulationSummary; label: string }) {
  if (population.total === 0) return <p className="text-xs text-muted-foreground">Grafik belum tersedia karena total penduduk raster nol.</p>;

  const series = [population.percentage, 100 - population.percentage];
  const percentage = (value: number) => `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
  const options: ApexOptions = {
    chart: { type: "donut", fontFamily: "inherit", background: "transparent", animations: { enabled: false }, toolbar: { show: false } },
    labels: ["Terlayani", "Tidak terlayani"],
    colors: ["#16a34a", "#ef4444"],
    stroke: { width: 2, colors: ["var(--card)"] },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: { pie: { donut: { size: "70%", labels: {
      show: true,
      name: { color: "var(--muted-foreground)", fontSize: "12px" },
      value: { color: "var(--foreground)", fontSize: "22px", formatter: (value) => percentage(Number(value)) },
      total: { show: true, showAlways: true, label: "Terlayani", color: "var(--muted-foreground)", formatter: () => percentage(population.percentage) },
    } } } },
    tooltip: { y: { formatter: (value) => value === null ? "" : percentage(value) } },
  };

  return <div role="img" aria-label={`${label}: terlayani ${percentage(series[0])}, tidak terlayani ${percentage(series[1])}`}>
    <Chart type="donut" height={220} width="100%" options={options} series={series} />
    <div className="space-y-2 text-xs">
      {["Terlayani", "Tidak terlayani"].map((name, index) => <div key={name} className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${index === 0 ? "bg-green-600" : "bg-red-500"}`} />
        <span className="flex-1 text-muted-foreground">{name}</span>
        <span className="tabular-nums">{percentage(series[index])}</span>
      </div>)}
    </div>
  </div>;
}
