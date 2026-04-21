import { cn } from "@/lib/utils";
import { letterFor } from "@/lib/api";

interface BingoBallProps {
  number: number;
  size?: "xs" | "sm" | "md" | "lg" | "hero";
  className?: string;
  animate?: boolean;
  showLetter?: boolean;
}

const sizes = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
  hero: "h-40 w-40 text-6xl",
};

const letterColors: Record<string, string> = {
  B: "from-[hsl(350_85%_60%)] to-[hsl(350_85%_45%)]",
  I: "from-[hsl(40_95%_60%)] to-[hsl(40_95%_45%)]",
  N: "from-[hsl(145_70%_50%)] to-[hsl(145_70%_38%)]",
  G: "from-[hsl(200_85%_55%)] to-[hsl(200_85%_42%)]",
  O: "from-[hsl(265_90%_66%)] to-[hsl(265_90%_50%)]",
};

export function BingoBall({ number, size = "md", className, animate, showLetter = true }: BingoBallProps) {
  const letter = letterFor(number);
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-full font-extrabold text-white select-none shadow-ball",
        "bg-gradient-to-br",
        letterColors[letter],
        sizes[size],
        animate && "animate-ball-pop",
        className,
      )}
    >
      {showLetter && size === "hero" && (
        <span className="text-2xl font-black opacity-90 leading-none mb-1">{letter}</span>
      )}
      <span className="leading-none">{number}</span>
    </div>
  );
}
