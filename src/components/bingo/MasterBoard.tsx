// Compact 1-75 master board grouped by B/I/N/G/O columns.
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

export function MasterBoard({ called, current }: MasterBoardProps) {
  const calledSet = new Set(called);
  const cols = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {cols.map(([lo, hi], i) => {
        const nums: number[] = [];
        for (let n = lo; n <= hi; n++) nums.push(n);
        return (
          <div key={i} className="flex flex-col gap-1">
            <div
              className={cn(
                "aspect-square rounded-md flex items-center justify-center font-black text-white text-xs",
                headerColors[i],
              )}
            >
              {HEADERS[i]}
            </div>
            {nums.map((n) => {
              const isCalled = calledSet.has(n);
              const isCurrent = n === current;
              return (
                <div
                  key={n}
                  className={cn(
                    "aspect-square rounded-md flex items-center justify-center text-[10px] font-bold transition-smooth",
                    isCurrent && "gradient-primary text-primary-foreground scale-110 shadow-elegant z-10 ring-2 ring-warning",
                    isCalled && !isCurrent && "bg-accent/30 text-accent",
                    !isCalled && "bg-secondary/50 text-muted-foreground",
                  )}
                >
                  {n}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
