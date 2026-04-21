// 5x5 Bingo card with B I N G O headers and FREE center.
// Numbers are auto-marked by the server; we just display state.
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

interface BingoCardProps {
  numbers: number[]; // length 25, index 12 = 0 (FREE)
  marked: number[];
  current: number | null;
  winningLine?: string | null;
  disabled?: boolean;
}

const HEADERS = ["B", "I", "N", "G", "O"];
const headerColors = [
  "bg-[hsl(350_85%_55%)]",
  "bg-[hsl(40_95%_55%)]",
  "bg-[hsl(145_70%_45%)]",
  "bg-[hsl(200_85%_50%)]",
  "bg-[hsl(265_90%_60%)]",
];

export function BingoCard({ numbers, marked, current, disabled }: BingoCardProps) {
  const { t } = useLang();
  const markedSet = new Set(marked);

  if (!numbers.length) {
    return (
      <div className="rounded-2xl bg-card/80 border border-border p-8 text-center text-muted-foreground">
        Watching mode — no card.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card/90 border border-border p-2.5 shadow-card">
      <div className="grid grid-cols-5 gap-1.5 mb-1.5">
        {HEADERS.map((h, i) => (
          <div
            key={h}
            className={cn(
              "aspect-square rounded-lg flex items-center justify-center font-black text-xl text-white",
              headerColors[i],
            )}
          >
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {numbers.map((n, idx) => {
          const isFree = idx === 12;
          const isMarked = markedSet.has(n) || isFree;
          const isCurrent = !isFree && n === current;
          return (
            <div
              key={idx}
              className={cn(
                "aspect-square rounded-lg flex items-center justify-center font-bold text-base border-2 transition-bounce",
                isFree && "gradient-win text-accent-foreground border-transparent text-xs uppercase",
                !isFree && isMarked && "gradient-primary text-primary-foreground border-transparent shadow-elegant scale-95",
                !isFree && !isMarked && isCurrent && "bg-warning/20 text-warning border-warning animate-pulse",
                !isFree && !isMarked && !isCurrent && "bg-secondary text-foreground border-border",
                disabled && "opacity-80",
              )}
            >
              {isFree ? t("free") : n}
            </div>
          );
        })}
      </div>
    </div>
  );
}
