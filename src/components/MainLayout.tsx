import { Outlet } from "react-router-dom";
import { BottomNavigation } from "@/components/BottomNavigation";
import { PhoneCompletionBanner } from "@/components/PhoneCompletionBanner";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function MainLayout() {
  return (
    <div className="min-h-screen">
      <PhoneCompletionBanner />
      <header className="sticky top-0 z-20 flex items-center justify-end border-b border-border/50 bg-background/80 px-4 py-2 backdrop-blur-md">
        <ThemeToggle />
      </header>
      <div id="main-content" className="pb-24">
        <Outlet />
      </div>
      <BottomNavigation />
    </div>
  );
}
