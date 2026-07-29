import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";

/**
 * Blocks the Mini App until the player has registered via the Telegram bot
 * (/start + share own phone contact). Manual in-app phone entry is not allowed.
 */
export function PhoneGate() {
  const location = useLocation();
  const { player, loading, needsPhoneNumber, refreshPlayer, fromTelegram } = useTelegramIdentity();
  const [refreshing, setRefreshing] = useState(false);

  if (location.pathname.startsWith("/admin")) return null;
  if (loading || !player || !needsPhoneNumber) return null;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const updated = await refreshPlayer();
      if (!updated?.phone_number?.trim()) {
        toast.message("Still waiting", {
          description: "Open the bot, send /start, share your phone, then tap Check again.",
        });
      } else {
        toast.success("Registration complete");
      }
    } catch {
      toast.error("Could not refresh. Try again.");
    } finally {
      setRefreshing(false);
    }
  }

  function openBot() {
    const botUrl = import.meta.env.VITE_TELEGRAM_BOT_URL as string | undefined;
    if (botUrl) {
      window.open(botUrl, "_blank");
      return;
    }
    // Close Mini App so the user can finish /start in the chat.
    window.Telegram?.WebApp?.close?.();
  }

  return (
    <Dialog open>
      <DialogContent
        className="max-w-sm"
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Register in the bot first
          </DialogTitle>
          <DialogDescription>
            The Mini App stays locked until you register with the Telegram bot.
            Send <strong>/start</strong> and share your own phone number, then come back.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Open the Yegara Bingo bot chat</li>
          <li>Send /start</li>
          <li>Tap Share phone number</li>
          <li>Return here and tap Check again</li>
        </ol>
        <div className="space-y-2 pt-1">
          <Button onClick={handleRefresh} disabled={refreshing} className="h-11 w-full">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Check again
              </>
            )}
          </Button>
          {(fromTelegram || import.meta.env.VITE_TELEGRAM_BOT_URL) && (
            <Button type="button" variant="outline" className="h-11 w-full" onClick={openBot}>
              Open bot to register
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
