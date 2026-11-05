"use client";

import { Camera, Eraser, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Zdjęcie z aparatu → JPEG max 1600 px (mniej danych przy słabym zasięgu). */
export async function compressPhoto(file: File, max = 1600, quality = 0.75): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((ok, fail) =>
      canvas.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob"))), "image/jpeg", quality),
    );
  } catch {
    return file; // stara przeglądarka: wysyłamy oryginał
  }
}

/** Zdjęcia z punktu: duży przycisk aparatu, miniatury z możliwością usunięcia przed zapisem. */
export function PhotoPicker({
  photos,
  onChange,
  label = "Zrób zdjęcie",
}: {
  photos: Blob[];
  onChange: (p: Blob[]) => void;
  label?: string;
}) {
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => urls.forEach((x) => URL.revokeObjectURL(x)), [urls]);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface text-base font-semibold active:bg-surface-2">
        <Camera className="size-5" /> {label}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            const blobs = await Promise.all(files.map((f) => compressPhoto(f)));
            onChange([...photos, ...blobs].slice(0, 10));
          }}
        />
      </label>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((u, i) => (
            <div key={u} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- podgląd lokalnego pliku (blob:) */}
              <img src={u} alt={`Zdjęcie ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
              <button
                type="button"
                aria-label="Usuń zdjęcie"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Podpis odbiorcy palcem na ekranie → PNG. */
export function SignaturePad({ onChange }: { onChange: (png: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#13241f";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    ref.current!.toBlob((b) => onChange(b), "image/png");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={ref}
        aria-label="Pole podpisu odbiorcy"
        className={cn(
          "h-36 w-full touch-none rounded-xl border-2 bg-white",
          empty ? "border-dashed border-border-strong" : "border-success",
        )}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          setEmpty(false);
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{empty ? "Odbiorca podpisuje się palcem w ramce" : "Podpis zapisany"}</span>
        <button
          type="button"
          className="flex h-10 items-center gap-1 px-2 font-medium"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          <Eraser className="size-4" /> Wyczyść
        </button>
      </div>
    </div>
  );
}
