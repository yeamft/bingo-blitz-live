import { Outlet } from "react-router-dom";
import { BottomNavigation } from "@/components/BottomNavigation";
import { PhoneCompletionBanner } from "@/components/PhoneCompletionBanner";

export function MainLayout() {
  return (
    <div className="min-h-screen">
      <PhoneCompletionBanner />
      <div id="main-content" className="pb-24">
        <Outlet />
      </div>
      <BottomNavigation />
    </div>
  );
}
