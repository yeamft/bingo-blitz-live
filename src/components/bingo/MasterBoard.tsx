// 75-ball master board: 5 letter groups × 3 sub-columns, call pills on the right.
import { letterFor } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MasterBoardProps {
  called: number[];
  current: number | null;
}

const HEADERS = ["B", "I", "N", "G", "O"];
const headerColors = [
  "bg-[hsl(350_85%_55%)]",
  "bg-[hsl(40_95%_55%)]",
  "bg-[hsl(145_70%_45%)]",
  "bg-[hsl(200_85%_50%)]",
  "bg-[hsl(265_90%_60%)]",
];

const letterBg: Record<string, string> = {
  B: "bg-[hsl(350_85%_55%)]",
  I: "bg-[hsl(40_95%_55%)]",
  N: "bg-[hsl(145_70%_45%)]",
  G: "bg-[hsl(200_85%_50%)]",
  O: "bg-[hsl(265_90%_60%)]",
};

export function MasterBoard({ called, current }: MasterBoardProps) {
  const calledSet = new Set(called);
  const ranges: Array<[number, number]> = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  const recentPills = [...called].reverse().slice(0, 6);

  return (
    <div className="flex gap-2 items-start">
      {/* 15-column number grid */}
      <div className="flex-1 min-w-0 flex gap-px">
        {ranges.map(([lo], letterIdx) => (
          <div key={letterIdx} className="flex-1 flex flex-col gap-px">
            <div
              className={cn(
                "h-[18px] rounded-sm flex items-center justify-center font-black text-[10px] text-white",
                headerColors[letterIdx],
              )}
            >
              {HEADERS[letterIdx]}
            </div>
            <div className="grid grid-cols-3 gap-px">
              {Array.from({ length: 5 }, (_, row) =>
                Array.from({ length: 3 }, (_, subCol) => {
                  const n = lo + subCol * 5 + row;
                  const isCalled = calledSet.has(n);
                  const isCurrent = n === current;
                  const letter = letterFor(n);
                  return (
                    <div
                      key={n}
                      className={cn(
                        "h-[15px] rounded-[2px] flex items-center justify-center font-bold text-[7px] transition-smooth",
                        isCurrent && "ring-1 ring-warning scale-110 z-10 text-white shadow-[0_0_6px_hsl(40_95%_60%/0.7)]",
                        isCurrent && letterBg[letter],
                        isCalled && !isCurrent && letterBg[letter] + " text-white",
                        !isCalled && "bg-secondary/40 text-muted-foreground/70",
                      )}
                    >
                      {n}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Called balls — vertical stack, does not overlap grid */}
      <div className="shrink-0 flex flex-col items-center gap-1 pt-5">
        {recentPills.length === 0 ? (
          <span className="text-[8px] text-muted-foreground italic w-8 text-center">—</span>
        ) : (
          recentPills.map((n, i) => {
            const letter = letterFor(n);
            const isCurrent = n === current;
            return (
              <div
                key={`${n}-${i}`}
                className={cn(
                  "rounded-full flex flex-col items-center justify-center text-white font-bold shadow-card",
                  letterBg[letter],
                  isCurrent ? "h-9 w-9 text-[10px] ring-2 ring-warning" : i === 1 ? "h-5 w-5 text-[7px] opacity-80" : "h-7 w-7 text-[8px]",
                )}
              >
                <span className="text-[7px] opacity-80 leading-none">{letter}</span>
                <span className="leading-none">{n}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
