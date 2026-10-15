export const materials = [
  { filename: "administrasi_kota_bandung.geojson", label: "Administrasi Kota Bandung", color: "#dc2626", srid: 4326 },
  { filename: "buffer_sarana_kesehatan.geojson", label: "Jangkauan sarana kesehatan", color: "#10b981", srid: 32748 },
  { filename: "titik_sarana_kesehatan.geojson", label: "Sarana kesehatan", color: "#e11d48", srid: 32748 },
  { filename: "penduduk_kota_bandung.tif", label: "Raster penduduk Kota Bandung", color: "#f59e0b", srid: null },
  { filename: "penduduk_kota_bandung.tif.aux.xml", label: "Metadata raster penduduk", color: "#94a3b8", srid: null },
] as const;
