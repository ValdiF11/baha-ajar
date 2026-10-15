"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapInstance } from "maplibre-gl";
import type { Feature, Point } from "geojson";
import { Layers, MapPin, RotateCcw } from "lucide-react";
import { materials } from "@/lib/materials";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MapAnalysis from "@/components/map-analysis";
import type { PopulationCell } from "@/lib/population-overlay";
import type { AnalysisMethod } from "@/lib/sni";

const mapMaterials = materials.filter((item) => item.filename !== "buffer_sarana_kesehatan.geojson" && !item.filename.endsWith(".xml"));
const rasterFilename = "penduduk_kota_bandung.tif";

export default function BandungMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [rasterRange, setRasterRange] = useState<[number, number] | null>(null);
  const [points, setPoints] = useState<Feature<Point>[]>([]);
  const [selectedPoint, setSelectedPoint] = useState("all");
  const [analysisMap, setAnalysisMap] = useState<MapInstance | null>(null);
  const [populationCells, setPopulationCells] = useState<PopulationCell[]>([]);
  const [resultsContainer, setResultsContainer] = useState<HTMLDivElement | null>(null);
  const [analysisMethod, setAnalysisMethod] = useState<AnalysisMethod>("iso");
  const [sniRadius, setSniRadius] = useState(3000);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let map: MapInstance | undefined;
    async function initialize() {
      try {
        const { Map, NavigationControl, Popup, setWorkerUrl } = await import("maplibre-gl");
        if (disposed || !container.current) return;
        setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        map = new Map({
          container: container.current,
          center: [107.6191, -6.9175], zoom: 11.4,
          style: {
            version: 8,
            sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
            layers: [{ id: "basemap", type: "raster", source: "osm", paint: { "raster-saturation": -0.65 } }],
          },
        });
        mapRef.current = map;
        map.addControl(new NavigationControl(), "top-right");
        map.on("error", () => {
          if (!disposed) setError("Sebagian peta gagal dimuat. Periksa koneksi internet, lalu muat ulang.");
        });
        map.on("load", async () => {
          const activeMap = map!;
          try {
            const [layers, raster] = await Promise.all([
              Promise.all(mapMaterials.filter((item) => item.srid).map(async (material) => {
              const response = await fetch(`/api/materials/${material.filename}`, { signal: controller.signal });
              if (!response.ok) throw new Error("Gagal memuat materi dari Neon. Silakan muat ulang halaman.");
              const data = await response.json();
              if (material.filename.startsWith("titik")) data.features = data.features.map((feature: Feature<Point>, index: number) => ({ ...feature, id: index }));
              return { material, data };
              })),
              (async () => {
                const response = await fetch(`/api/materials/${rasterFilename}?download=1`, { signal: controller.signal });
                if (!response.ok) throw new Error("Gagal memuat raster penduduk dari Neon.");
                const { decodePopulationRaster } = await import("@/lib/population-raster");
                return decodePopulationRaster(await response.arrayBuffer());
              })(),
            ]);
            if (disposed) return;
            const canvas = document.createElement("canvas");
            canvas.width = raster.width;
            canvas.height = raster.height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Raster penduduk tidak dapat dirender.");
            context.putImageData(new ImageData(raster.pixels, raster.width, raster.height), 0, 0);
            activeMap.addSource(rasterFilename, { type: "canvas", canvas, coordinates: raster.coordinates, animate: false });
            activeMap.addLayer({ id: rasterFilename, source: rasterFilename, type: "raster", paint: { "raster-opacity": 0.75, "raster-resampling": "nearest", "raster-fade-duration": 0 } });
            for (const { material, data } of layers) {
              const id = material.filename;
              activeMap.addSource(id, { type: "geojson", data });
              if (id.startsWith("titik")) {
                setPoints(data.features);
                activeMap.addLayer({ id, source: id, type: "circle", paint: { "circle-radius": 5, "circle-color": material.color, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
                activeMap.on("click", id, (event) => {
                  const feature = event.features?.[0];
                  if (!feature) return;
                  const properties = feature.properties;
                  setSelectedPoint(String(feature.id));
                  new Popup().setLngLat(event.lngLat).setText(properties?.NAMOBJ || `Titik ${Number(feature.id) + 1} · ${properties?.REMARK || "Sarana kesehatan"}`).addTo(activeMap);
                });
                activeMap.on("mouseenter", id, () => { activeMap.getCanvas().style.cursor = "pointer"; });
                activeMap.on("mouseleave", id, () => { activeMap.getCanvas().style.cursor = ""; });
              } else {
                activeMap.addLayer({ id, source: id, type: "fill", paint: { "fill-color": material.color, "fill-opacity": 0 } });
                activeMap.addLayer({ id: `${id}-outline`, source: id, type: "line", paint: { "line-color": material.color, "line-width": 3, "line-opacity": 1 } });
              }
            }
            setCounts(Object.fromEntries(layers.map(({ material, data }) => [material.filename, data.features.length])));
            setVisible(Object.fromEntries(mapMaterials.map((material) => [material.filename, true])));
            setRasterRange([raster.min, raster.max]);
            setPopulationCells(raster.cells);
            setAnalysisMap(activeMap);
            setReady(true);
          } catch (cause) {
            if (!disposed) setError(cause instanceof Error ? cause.message : "Materi gagal dimuat.");
          }
        });
      } catch {
        if (!disposed) setError("Peta tidak dapat dibuka. Pastikan browser mendukung WebGL.");
      }
    }
    void initialize();
    return () => { disposed = true; controller.abort(); map?.remove(); mapRef.current = null; };
  }, []);

  function toggle(filename: string) {
    const map = mapRef.current;
    if (!map?.getLayer(filename)) return;
    const next = !visible[filename];
    for (const id of [filename, `${filename}-outline`]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", next ? "visible" : "none");
    }
    setVisible((previous) => ({ ...previous, [filename]: next }));
  }

  return (
    <main className="relative h-dvh min-h-[500px] overflow-hidden bg-slate-100 text-slate-900">
      <div ref={container} style={{ position: "absolute", inset: 0 }} aria-label="Peta interaktif sarana kesehatan Kota Bandung" />
      <Card className="absolute left-3 top-3 z-10 max-h-[calc(100dvh-6rem)] w-[calc(100%-4.5rem)] max-w-88 overflow-y-auto shadow-lg sm:left-6 sm:top-6">
        <CardHeader className="gap-3 border-b">
          <div className="flex items-center gap-3 text-base font-semibold leading-snug"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><MapPin className="size-4" /></span>Simulasi SIG Microteaching Telkom University</div>
          <CardTitle><h1 className="text-lg font-semibold leading-snug tracking-tight">Analisis Keterjangkauan Fasilitas Pelayanan Kesehatan Kota Bandung</h1></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Layers className="size-3.5" />Layer peta</h2>
        <div className="divide-y overflow-hidden rounded-lg border">
          {mapMaterials.map((material) => (
            <label key={material.filename} className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
              <Checkbox disabled={!ready} checked={visible[material.filename] ?? false} onCheckedChange={() => toggle(material.filename)} />
              <span className="flex-1 text-xs font-medium leading-5">{material.label}</span>
              <span aria-hidden="true" className={material.filename.startsWith("administrasi") ? "w-4 shrink-0 border-t-[3px]" : "size-2 shrink-0 rounded-full"} style={material.filename.startsWith("administrasi") ? { borderColor: material.color } : { background: material.color }} />
              {counts[material.filename] !== undefined && <span className="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center text-[11px] tabular-nums text-muted-foreground">{counts[material.filename]}</span>}
            </label>
          ))}
        </div>
        {rasterRange && visible[rasterFilename] && <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <p>Jumlah penduduk per piksel (~100 m)</p>
          <div className="h-2 rounded-sm" style={{ background: "linear-gradient(to right, #22c55e, #facc15, #ef4444)" }} />
          <div className="flex justify-between"><span>{Math.round(rasterRange[0])}</span><span>{Math.round(rasterRange[1])} jiwa</span></div>
        </div>}
        <MapAnalysis key={`${selectedPoint}-${analysisMethod}`} method={analysisMethod} onMethodChange={setAnalysisMethod} sniRadius={sniRadius} onSniRadiusChange={setSniRadius} map={analysisMap} points={points} populationCells={populationCells} resultsContainer={resultsContainer} selected={selectedPoint} onSelect={(value) => {
          setSelectedPoint(value);
          if (value !== "all") {
            const [lon, lat] = points[Number(value)].geometry.coordinates;
            mapRef.current?.flyTo({ center: [lon, lat], zoom: 14 });
          }
        }} />
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => mapRef.current?.flyTo({ center: [107.6191, -6.9175], zoom: 11.4 })}><RotateCcw />Kembali ke Bandung</Button>
        </CardFooter>
      </Card>
      <div ref={setResultsContainer} className="absolute bottom-24 right-3 z-20 max-h-[45dvh] w-[calc(100%-1.5rem)] max-w-[480px] overflow-y-auto rounded-xl shadow-lg md:bottom-auto md:right-20 md:top-6 md:max-h-[calc(100dvh-6rem)] md:w-[min(480px,calc(100vw-30rem))]" />
      <div role={error ? "alert" : "status"} className={`absolute bottom-10 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg bg-white/95 px-3 py-2 text-xs shadow sm:left-6 ${error ? "text-red-700" : "text-slate-600"}`}>
        {error || (ready ? "Data bahan ajar dimuat dari Neon · Klik titik untuk melihat informasi" : "Memuat peta dan bahan ajar…")}
      </div>
    </main>
  );
}
