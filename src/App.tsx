import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MainLayout } from "@/components/MainLayout";
import Index from "./pages/Index.tsx";
import HistoryPage from "./pages/History.tsx";
import WalletPage from "./pages/Wallet.tsx";
import ProfilePage from "./pages/Profile.tsx";
import Room from "./pages/Room.tsx";
import AdminPage from "./pages/Admin.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/game" replace />} />
          <Route element={<MainLayout />}>
            <Route path="/game" element={<Index />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/room/:code" element={<Room />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
