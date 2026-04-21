// Horizontal scroll showing the last N calls. Newest first on the left.
import { letterFor } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CallLogProps {
  called: number[]; // chronological order
  limit?: number;
}

const letterColors: Record<string, string> = {
  B: "bg-[hsl(350_85%_55%)]",
  I: "bg-[hsl(40_95%_55%)]",
  N: "bg-[hsl(145_70%_45%)]",
  G: "bg-[hsl(200_85%_50%)]",
  O: "bg-[hsl(265_90%_60%)]",
};

export function CallLog({ called, limit = 5 }: CallLogProps) {
  const recent = [...called].reverse().slice(0, limit);
  if (recent.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">No numbers called yet.</div>
    );
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {recent.map((n, i) => {
        const letter = letterFor(n);
        return (
          <div
            key={`${n}-${i}`}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-white font-bold text-sm shrink-0 shadow-card",
              letterColors[letter],
              i === 0 && "ring-2 ring-warning",
            )}
          >
            <span className="text-xs opacity-80">{letter}</span>
            <span>{n}</span>
          </div>
        );
      })}
    </div>
  );
}
