import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sniRule, type SniAllocation, type SniCapacityRow } from "@/lib/sni";

const number = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 1 });

export default function SniCapacityResults({ rows, radius, allocation }: { rows: SniCapacityRow[]; radius: number; allocation: SniAllocation | null }) {
  const rule = sniRule(radius);
  const over = rows.filter((row) => row.overcapacity).length;
  return <section className="space-y-4" aria-label="Hasil kapasitas SNI">
    <div className="space-y-2"><p className="text-sm font-semibold">SNI 03-1733-2004</p><p className="text-xs text-muted-foreground">{rule.label}</p>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border bg-muted/30 p-3"><dt className="text-muted-foreground">Jarak jangkauan</dt><dd className="mt-1 font-semibold">{number(radius / 1000)} km</dd></div>
        <div className="rounded-lg border bg-muted/30 p-3"><dt className="text-muted-foreground">Batas per fasilitas</dt><dd className="mt-1 font-semibold">{number(rule.populationPerUnit)} jiwa</dd></div>
      </dl>
    </div>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legenda kapasitas">
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-green-600" />Belum melebihi batas</span>
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-600" />Melebihi batas</span>
    </div>
    {allocation && <div className="space-y-3 rounded-lg border bg-muted/30 p-3" aria-label="Ringkasan alokasi penduduk">
      <p className="text-sm font-semibold">Pembagian penduduk ke fasilitas</p>
      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-2"><dt>Dalam jangkauan</dt><dd className="font-medium tabular-nums">{number(allocation.allocated)} jiwa</dd></div>
        <div className="flex justify-between gap-2"><dt>Tidak terjangkau</dt><dd className="font-medium tabular-nums">{number(allocation.unreachable)} jiwa</dd></div>
        <div className="flex justify-between gap-2 border-t pt-2"><dt>Total penduduk pada data</dt><dd className="font-medium tabular-nums">{number(allocation.total)} jiwa</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">Penduduk dibagi ke fasilitas terdekat yang masih bisa dijangkau. Walaupun masuk beberapa lingkaran, penduduk hanya dihitung sekali. Penduduk di luar semua lingkaran dicatat sebagai tidak terjangkau.</p>
      <p className="text-xs text-muted-foreground">Lingkaran pada peta menunjukkan jarak jangkauan setiap fasilitas, bukan batas pembagian penduduk.</p>
    </div>}
    {rows.length === 1 ? (() => {
      const row = rows[0];
      return <div className="space-y-4" aria-label="Kapasitas fasilitas terpilih">
        <p className="text-sm font-medium">{row.label}</p>
        <div className={`rounded-lg border p-3 ${row.overcapacity ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}>
          <p className={`text-sm font-semibold ${row.overcapacity ? "text-destructive" : "text-foreground"}`}>{row.overcapacity ? "Penduduk melebihi batas fasilitas" : row.population === rule.populationPerUnit ? "Jumlah penduduk tepat pada batas" : "Jumlah penduduk belum melebihi batas"}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{number(row.utilization)}%</p><p className="text-xs text-muted-foreground">100% berarti jumlah penduduk tepat pada batas. Lebih dari 100% berarti melebihi batas.</p>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Penduduk dalam jangkauan</dt><dd className="font-medium tabular-nums">{number(row.population)} jiwa</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Penduduk di atas batas</dt><dd className="font-medium tabular-nums">{number(row.excess)} jiwa</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Total fasilitas yang dibutuhkan</dt><dd className="font-medium">{number(row.requiredUnits)} unit</dd></div>
          <div className="flex justify-between gap-2 rounded-lg bg-muted p-3"><dt>Fasilitas tambahan</dt><dd className="font-semibold">{number(row.additionalUnits)} unit</dd></div>
        </dl>
      </div>;
    })() : <div className="space-y-3">
      <p className="text-sm"><strong>{over}</strong> dari {rows.length} fasilitas mendapat jumlah penduduk di atas batas.</p>
      <Table><TableHeader><TableRow><TableHead>Titik</TableHead><TableHead className="text-right">Penduduk</TableHead><TableHead className="text-right">Beban</TableHead><TableHead className="text-right">Tambahan</TableHead></TableRow></TableHeader><TableBody>
        {rows.map((row) => <TableRow key={row.pointId}>
          <TableCell className="text-xs">{row.label}<span className={`block text-[10px] ${row.overcapacity ? "text-destructive" : "text-muted-foreground"}`}>{row.overcapacity ? "Melebihi batas" : "Belum melebihi batas"}</span></TableCell>
          <TableCell className="text-right text-xs tabular-nums">{number(row.population)}</TableCell><TableCell className="text-right text-xs tabular-nums">{number(row.utilization)}%</TableCell><TableCell className="text-right text-xs tabular-nums">{row.additionalUnits}</TableCell>
        </TableRow>)}
      </TableBody></Table>
      <p className="text-xs text-muted-foreground">Kolom Penduduk menunjukkan jumlah penduduk yang dibagi ke setiap fasilitas. Beban 100% berarti tepat pada batas; lebih dari 100% berarti perlu tambahan fasilitas. Kolom Tambahan menunjukkan perkiraan jumlah fasilitas baru.</p>
      <p className="text-xs text-muted-foreground">Penduduk tetap dihitung di fasilitas terdekat, meskipun jumlahnya melebihi batas. Aplikasi belum memindahkannya ke fasilitas lain yang masih memiliki tempat.</p>
    </div>}
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>Setiap titik dianggap memiliki satu fasilitas. {allocation ? "Jumlah penduduknya berasal dari pembagian ke fasilitas terdekat." : "Karena hanya satu titik yang dipilih, semua penduduk dalam lingkarannya dihitung, tanpa dibagi ke fasilitas lain."}</p>
      <p>Contoh: {number(rule.populationPerUnit * 2)} penduduk membutuhkan 2 fasilitas dengan batas {number(rule.populationPerUnit)} jiwa per fasilitas. Jika sudah ada 1 fasilitas, perlu tambahan 1 lagi.</p>
      <p>Hasil ini merupakan perkiraan kebutuhan fasilitas berdasarkan SNI, bukan jumlah pasien yang benar-benar dapat ditangani. Lokasi fasilitas baru belum ditentukan.</p>
    </div>
    <a className="text-xs text-muted-foreground underline underline-offset-4" href="https://pupr.payakumbuhkota.go.id/wp-content/uploads/2020/09/Tata-Cara-Perencanaan-Lingkungan-Perumahan-di-Perkotaan-_-SNI-03-1733-2004.pdf#page=35" target="_blank" rel="noreferrer">Sumber: SNI 03-1733-2004, Tabel 12</a>
  </section>;
}
