"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExpressionSpecification, GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ChartPie, ChevronDown, CircleDashed, Route, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { summarizePopulation, type PopulationCell, type PopulationSummary } from "@/lib/population-overlay";
import PopulationCoverageChart from "@/components/population-coverage-chart";
import { allocateSniPopulation, assessSniCapacity, sniRule, type AnalysisMethod, type SniAllocation, type SniCapacityRow } from "@/lib/sni";
import SniCapacityResults from "@/components/sni-capacity-results";

type Area = FeatureCollection<Polygon | MultiPolygon>;
type Kind = "buffer" | "isochrone";
const modes = { pedestrian: "Jalan kaki", auto: "Mobil", bicycle: "Sepeda" };

export default function MapAnalysis({ map, points, populationCells, selected, onSelect, resultsContainer, method, onMethodChange, sniRadius, onSniRadiusChange }: {
  map: MapInstance | null;
  points: Feature<Point>[];
  populationCells: PopulationCell[];
  selected: string;
  onSelect: (value: string) => void;
  resultsContainer: HTMLDivElement | null;
  method: AnalysisMethod;
  onMethodChange: (value: AnalysisMethod) => void;
  sniRadius: number;
  onSniRadiusChange: (value: number) => void;
}) {
  const [distance, setDistance] = useState("500");
  const [customDistance, setCustomDistance] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [customMinutes, setCustomMinutes] = useState("");
  const [mode, setMode] = useState("pedestrian");
  const [busy, setBusy] = useState<Kind | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Partial<Record<Kind, { label: string; population: PopulationSummary }>>>({});
  const [sniResults, setSniResults] = useState<SniCapacityRow[] | null>(null);
  const [sniAllocation, setSniAllocation] = useState<SniAllocation | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => {
    const controller = pending.current;
    pending.current = null;
    controller?.abort();
  }, []);

  useEffect(() => {
    if (!map) return;
    map.setPaintProperty("titik_sarana_kesehatan.geojson", "circle-radius", selected === "all" ? 5 : ["case", ["==", ["id"], Number(selected)], 8, 5]);
  }, [map, selected]);

  useEffect(() => {
    pending.current?.abort();
    if (!map) return;
    for (const kind of ["buffer", "isochrone"]) {
      const source = map.getSource(`analysis-${kind}`) as GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features: [] });
    }
  }, [map, selected]);

  function showArea(kind: Kind, data: Area) {
    if (!map) return;
    const id = `analysis-${kind}`;
    const color: string | ExpressionSpecification = kind === "buffer" ? method === "sni" ? ["case", ["boolean", ["get", "overcapacity"], false], "#dc2626", "#16a34a"] : "#2563eb" : "#9333ea";
    const source = map.getSource(id) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      map.setPaintProperty(id, "fill-color", color);
      map.setPaintProperty(`${id}-outline`, "line-color", color);
      map.setPaintProperty(id, "fill-opacity", method === "sni" && selected === "all" ? 0 : 0.16);
    }
    else {
      map.addSource(id, { type: "geojson", data });
      map.addLayer({ id, source: id, type: "fill", paint: { "fill-color": color, "fill-opacity": method === "sni" && selected === "all" ? 0 : 0.16 } }, "administrasi_kota_bandung.geojson");
      map.addLayer({ id: `${id}-outline`, source: id, type: "line", paint: { "line-color": color, "line-width": 2 } }, "administrasi_kota_bandung.geojson");
    }
  }

  function clear() {
    pending.current?.abort();
    showArea("buffer", { type: "FeatureCollection", features: [] });
    showArea("isochrone", { type: "FeatureCollection", features: [] });
    setResults({});
    setSniResults(null);
    setSniAllocation(null);
    setError("");
  }

  async function run(kind: Kind) {
    if (!map || pending.current) return;
    if (method === "sni" && kind !== "buffer") return;
    const value = method === "sni" ? sniRule(sniRadius).radius : Number(kind === "buffer" ? distance === "custom" ? customDistance : distance : minutes === "custom" ? customMinutes : minutes);
    if (!Number.isFinite(value) || value < 1 || value > (kind === "buffer" ? 50000 : 120)) {
      setError(kind === "buffer" ? "Masukkan jarak 1–50.000 meter." : "Masukkan waktu 1–120 menit.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(kind);
    setError("");
    setResults((previous) => ({ ...previous, [kind]: undefined }));
    setSniResults(null);
    setSniAllocation(null);
    showArea(kind, { type: "FeatureCollection", features: [] });
    const pointLabel = selected === "all" ? `Semua ${points.length} titik` : `Titik ${Number(selected) + 1}`;
    try {
      const ids = kind === "buffer" ? [selected] : selected === "all" ? points.map((_, index) => String(index)) : [selected];
      const combined: Area = { type: "FeatureCollection", features: [] };
      for (let index = 0; index < ids.length; index++) {
        setProgress(`${kind === "buffer" ? "Menghitung buffer" : "Menghitung isochrone"} ${index + 1}/${ids.length}…`);
        const response = await fetch(`/api/analysis/${method === "sni" ? "sni" : kind}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ pointId: ids[index] === "all" ? "all" : Number(ids[index]), value, mode, radius: sniRadius }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Analisis gagal dihitung.");
        if (controller.signal.aborted) return;
        combined.features.push(...data.features);
        showArea(kind, combined);
        if (index < ids.length - 1) await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, 1100);
          function abort() { clearTimeout(timeout); reject(new DOMException("Dibatalkan", "AbortError")); }
          controller.signal.addEventListener("abort", abort, { once: true });
        });
      }
      if (method === "sni") {
        const rule = sniRule(sniRadius);
        const allocation = selected === "all" ? allocateSniPopulation(populationCells, combined.features.map((feature) => {
          const pointId = Number(feature.properties?.point_id);
          const point = points.find((item) => item.id === pointId);
          if (!point) throw new Error("Koordinat fasilitas untuk alokasi tidak ditemukan.");
          const [lon, lat] = point.geometry.coordinates;
          return { pointId, label: String(feature.properties?.label), coordinates: [lon, lat] };
        }), sniRadius) : null;
        const rows = allocation?.rows ?? combined.features.map((feature) => {
          const population = summarizePopulation(populationCells, { type: "FeatureCollection", features: [feature] });
          const assessment = assessSniCapacity(population.inside, rule.populationPerUnit);
          return { ...assessment, pointId: Number(feature.properties?.point_id), label: String(feature.properties?.label) };
        });
        for (const feature of combined.features) feature.properties = { ...feature.properties, overcapacity: rows.find((row) => row.pointId === feature.properties?.point_id)?.overcapacity ?? false };
        showArea("buffer", combined);
        setSniResults(rows);
        setSniAllocation(allocation);
        return;
      }
      const population = summarizePopulation(populationCells, combined);
      setResults((previous) => ({ ...previous, [kind]: {
        label: `${kind === "buffer" ? `${value.toLocaleString("id-ID")} m` : `${value} menit · ${modes[mode as keyof typeof modes]}`} · ${pointLabel}`,
        population,
      } }));
    } catch (cause) {
      if (pending.current === controller) showArea(kind, { type: "FeatureCollection", features: [] });
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Analisis gagal dihitung.");
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(null);
        setProgress("");
      }
    }
  }

  return <section className="space-y-4 border-t pt-4" aria-labelledby="analysis-heading">
    <h2 id="analysis-heading" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><SlidersHorizontal className="size-3.5" />Analisis jangkauan</h2>
    <div className="space-y-2">
      <Label htmlFor="analysis-method">Metode analisis</Label>
      <NativeSelect id="analysis-method" className="w-full" value={method} onChange={(event) => { clear(); onMethodChange(event.target.value as AnalysisMethod); }}>
        <NativeSelectOption value="iso">ISO 37120:2018 · Cakupan</NativeSelectOption>
        <NativeSelectOption value="sni">SNI 03-1733-2004 · Kebutuhan sarana</NativeSelectOption>
      </NativeSelect>
      <p className="text-xs text-muted-foreground">{method === "sni" ? "Pilih jarak untuk melihat apakah jumlah penduduk melebihi batas satu fasilitas." : "Lihat berapa persen penduduk yang berada di dalam dan di luar jangkauan fasilitas."}</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor="analysis-point">Pilih titik</Label>
      <NativeSelect id="analysis-point" className="w-full" value={selected} disabled={!map || Boolean(busy)} onChange={(event) => { clear(); onSelect(event.target.value); }}>
        <NativeSelectOption value="all">Semua titik ({points.length})</NativeSelectOption>
        {points.map((point, index) => <NativeSelectOption key={index} value={String(index)}>{point.properties?.NAMOBJ || `Titik ${String(index + 1).padStart(2, "0")}`}</NativeSelectOption>)}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">Atau klik titik fasilitas pada peta.</p>
    </div>
    <details className="group rounded-lg border p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"><CircleDashed className="size-4 text-blue-600" />Buffer<ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
      <div className="mt-3 space-y-3">
      <Label htmlFor="buffer-distance">Jarak buffer</Label>
      {method === "sni" ? <>
        <NativeSelect id="buffer-distance" className="w-full" value={String(sniRadius)} disabled={Boolean(busy)} onChange={(event) => { clear(); onSniRadiusChange(Number(event.target.value)); }}>
          <NativeSelectOption value="1500">1,5 km · Puskesmas Pembantu</NativeSelectOption>
          <NativeSelectOption value="3000">3 km · Puskesmas</NativeSelectOption>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">Satu fasilitas dianggap melayani paling banyak {sniRule(sniRadius).populationPerUnit.toLocaleString("id-ID")} penduduk dalam perhitungan ini. Setiap titik dianggap memiliki satu fasilitas.</p>
      </> : <NativeSelect id="buffer-distance" className="w-full" value={distance} disabled={Boolean(busy)} onChange={(event) => setDistance(event.target.value)}>
        <NativeSelectOption value="500">500 m</NativeSelectOption><NativeSelectOption value="800">800 m</NativeSelectOption>
        <NativeSelectOption value="1500">1,5 km</NativeSelectOption><NativeSelectOption value="3000">3 km</NativeSelectOption><NativeSelectOption value="custom">Custom</NativeSelectOption>
      </NativeSelect>}
      {method === "iso" && distance === "custom" && <Input aria-label="Jarak buffer custom (meter)" type="number" min={1} max={50000} placeholder="Jarak dalam meter" value={customDistance} onChange={(event) => setCustomDistance(event.target.value)} disabled={Boolean(busy)} />}
      <Button variant="outline" className="w-full" disabled={!map || Boolean(busy)} onClick={() => run("buffer")}>Tampilkan buffer</Button>
      {results.buffer && <p className="text-xs text-muted-foreground">Buffer (biru): {results.buffer.label}</p>}
      </div>
    </details>
    {method === "iso" ? <details className="group rounded-lg border p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"><Route className="size-4 text-purple-600" />Isochrone<ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
      <div className="mt-3 space-y-3">
      <Label htmlFor="isochrone-mode">Moda perjalanan</Label>
      <NativeSelect id="isochrone-mode" aria-label="Moda perjalanan" className="w-full" value={mode} disabled={Boolean(busy)} onChange={(event) => setMode(event.target.value)}>
        {Object.entries(modes).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
      </NativeSelect>
      <NativeSelect aria-label="Waktu isochrone" className="w-full" value={minutes} disabled={Boolean(busy)} onChange={(event) => setMinutes(event.target.value)}>
        {[5, 10, 15, 30, 45].map((value) => <NativeSelectOption key={value} value={String(value)}>{value} menit</NativeSelectOption>)}
        <NativeSelectOption value="custom">Custom</NativeSelectOption>
      </NativeSelect>
      {minutes === "custom" && <Input aria-label="Waktu isochrone custom (menit)" type="number" min={1} max={120} placeholder="Waktu dalam menit" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} disabled={Boolean(busy)} />}
      <Button variant="outline" className="w-full" disabled={!map || Boolean(busy)} onClick={() => run("isochrone")}>Tampilkan isochrone</Button>
      {results.isochrone && <p className="text-xs text-muted-foreground">Isochrone (ungu): {results.isochrone.label}</p>}
      <p className="text-xs text-muted-foreground">Menunjukkan wilayah yang dapat dicapai lewat jalan dalam waktu pilihan Anda. Jika memilih semua titik, perhitungan dilakukan satu per satu.</p>
      </div>
    </details> : <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Isochrone dikunci pada mode SNI. Gunakan buffer 1,5 km atau 3 km.</div>}
    {busy && <><p role="status" className="text-xs text-muted-foreground">{progress}</p><Button variant="secondary" className="w-full" onClick={() => pending.current?.abort()}>Batalkan</Button></>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {resultsContainer && (sniResults || results.buffer || results.isochrone) && createPortal(<Card aria-label="Hasil analisis">
      <CardHeader className="gap-3 border-b">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="flex size-8 items-center justify-center rounded-lg bg-muted"><ChartPie className="size-4" /></span>Ringkasan analisis</div>
        <CardTitle className="text-lg font-semibold tracking-tight">Hasil analisis</CardTitle><CardDescription>{method === "sni" ? "Skenario kebutuhan sarana · SNI 03-1733-2004" : "Cakupan penduduk · ISO 37120:2018"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5" aria-label="Ringkasan penduduk">
      {sniResults && <SniCapacityResults rows={sniResults} radius={sniRadius} allocation={sniAllocation} />}
      {(["buffer", "isochrone"] as const).map((kind) => {
        const result = results[kind];
        if (!result) return null;
        return <div key={kind} className="space-y-4 border-b pb-5" aria-label={`Penduduk ${kind}`}>
          <div className="space-y-1.5"><p className="flex items-center gap-2 text-sm font-semibold">{kind === "buffer" ? <CircleDashed className="size-4 text-blue-600" /> : <Route className="size-4 text-purple-600" />}{kind === "buffer" ? "Buffer" : "Isochrone"}</p>
          <p className="text-xs text-muted-foreground">{result.label}</p></div>
          <PopulationCoverageChart population={result.population} label={kind === "buffer" ? "Buffer" : "Isochrone"} />
          <dl className="grid grid-cols-2 gap-2">
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3"><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-green-600" />Terlayani</dt><dd className="text-lg font-semibold tracking-tight tabular-nums">{result.population.inside.toLocaleString("id-ID")}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">jiwa</span></dd></div>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3"><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-red-500" />Tidak terlayani</dt><dd className="text-lg font-semibold tracking-tight tabular-nums">{result.population.outside.toLocaleString("id-ID")}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">jiwa</span></dd></div>
          </dl>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Users className="size-3.5" />Total penduduk raster</span><span className="font-medium tabular-nums text-foreground">{result.population.total.toLocaleString("id-ID")} jiwa</span></div>
        </div>;
      })}
      <p className="text-xs text-muted-foreground">Jumlah penduduk merupakan perkiraan dari peta penduduk Kota Bandung yang dibagi menjadi kotak-kotak sekitar 100 meter. Posisi tengah setiap kotak dipakai untuk menentukan jangkauan. Kotak tanpa data tidak dihitung, dan angka dibulatkan ke jiwa.</p>
      </CardContent>
      <CardFooter><Button variant="outline" className="w-full" onClick={clear}><Trash2 />Hapus analisis</Button></CardFooter>
    </Card>, resultsContainer)}
  </section>;
}
