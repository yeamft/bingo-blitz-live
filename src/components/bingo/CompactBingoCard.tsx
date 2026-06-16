import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { numbersToBingo, countMarkedOnCard } from "@/lib/bingo-lines";

interface CompactBingoCardProps {
  index: number;
  numbers: number[];
  marked: number[];
  current: number | null;
  called?: number[];
  disabled?: boolean;
  onSelectNumber?: (n: number) => void;
}

const HEADERS = ["B", "I", "N", "G", "O"];
const headerColors = [
  "bg-[hsl(350_85%_55%)]",
  "bg-[hsl(40_95%_55%)]",
  "bg-[hsl(145_70%_45%)]",
  "bg-[hsl(200_85%_50%)]",
  "bg-[hsl(265_90%_60%)]",
];

const barColors = [
  "bg-[hsl(350_85%_55%)]",
  "bg-[hsl(145_70%_45%)]",
  "bg-[hsl(40_95%_55%)]",
  "bg-[hsl(265_90%_60%)]",
];

export function CompactBingoCard({
  index,
  numbers,
  marked,
  current,
  disabled,
  called = [],
  onSelectNumber,
}: CompactBingoCardProps) {
  const { t } = useLang();
  const markedSet = new Set(marked);
  const calledSet = new Set(called);
  const markedCount = countMarkedOnCard(numbers, marked);
  const toBingo = numbersToBingo(numbers, marked);
  const progressPct = Math.round((markedCount / 24) * 100);

  return (
    <div className="rounded-xl bg-card/95 border border-border/60 overflow-hidden shadow-card">
      {/* Colored header bar */}
      <div className={cn("px-2 py-1 flex items-center justify-between gap-1", barColors[index % 4] + "/20")}>
        <span className="text-[9px] font-black uppercase tracking-wider text-foreground">
          {t("cartela")} {index + 1}
        </span>
        <div className="flex items-center gap-1 flex-1 justify-end">
          <div className="flex-1 max-w-[50px] h-1 rounded-full bg-secondary/60 overflow-hidden">
            <div
              className={cn("h-full rounded-full", barColors[index % 4])}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[8px] font-bold tabular-nums text-muted-foreground">{markedCount} / 24</span>
          {toBingo <= 3 && (
            <span className="text-[8px] font-black text-warning">{toBingo} {t("toBingo")}</span>
          )}
        </div>
      </div>

      <div className="p-1">
        <div className="grid grid-cols-5 gap-px mb-px">
          {HEADERS.map((h, i) => (
            <div
              key={h}
              className={cn(
                "h-4 rounded-sm flex items-center justify-center font-black text-[9px] text-white",
                headerColors[i],
              )}
            >
              {h}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-px">
          {numbers.map((n, idx) => {
            const isFree = idx === 12;
            const isMarked = markedSet.has(n) || isFree;
            const isCurrent = !isFree && n === current;
            const canSelect =
              !disabled && !isFree && !isMarked && calledSet.has(n) && typeof onSelectNumber === "function";

            return (
              <button
                key={idx}
                type="button"
                onClick={() => canSelect && onSelectNumber?.(n)}
                disabled={!canSelect}
                className={cn(
                  "aspect-square rounded-sm flex items-center justify-center font-bold text-[10px] transition-smooth",
                  isFree && "bg-secondary/60 text-[7px] text-muted-foreground",
                  !isFree && isMarked && "bg-secondary/50 text-foreground ring-2 ring-warning shadow-[0_0_6px_hsl(40_95%_60%/0.45)]",
                  !isFree && !isMarked && isCurrent && "bg-warning/20 text-warning ring-1 ring-warning",
                  !isFree && !isMarked && !isCurrent && "bg-secondary/30 text-foreground/80",
                  canSelect && "ring-1 ring-accent/50 cursor-pointer",
                )}
              >
                {isFree ? "★" : n}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
