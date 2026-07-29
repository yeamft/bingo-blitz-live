import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { getErrorMessage } from "@/lib/api";

function normalizePhoneInput(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0") && digits.length === 10) digits = `251${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 9) digits = `251${digits}`;
  return digits;
}

export function PhoneGate() {
  const location = useLocation();
  const {
    player,
    loading,
    needsPhoneNumber,
    completePhoneRegistration,
    requestTelegramContact,
    fromTelegram,
  } = useTelegramIdentity();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Admin uses its own auth surface; do not block /admin with player phone gate.
  if (location.pathname.startsWith("/admin")) return null;
  if (loading || !player || !needsPhoneNumber) return null;

  async function handleSubmit() {
    const cleaned = normalizePhoneInput(phone.trim());
    if (!cleaned || cleaned.length < 9) {
      toast.error("Enter a valid phone number");
      return;
    }

    setSubmitting(true);
    try {
      await completePhoneRegistration(cleaned);
      toast.success("Account ready");
      setPhone("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
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
            Finish registration
          </DialogTitle>
          <DialogDescription>
            Share your phone number to unlock play, deposits, and withdrawals.
            {fromTelegram
              ? " You can also share it from the Telegram bot with /start."
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx or 2519xxxxxxxx"
            inputMode="tel"
            autoComplete="tel"
            className="h-11"
          />
          <Button onClick={handleSubmit} disabled={submitting} className="w-full h-11">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save phone & continue"}
          </Button>
          {fromTelegram && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                const requested = requestTelegramContact();
                if (!requested) {
                  toast.message("Enter your phone number below");
                }
              }}
            >
              Share via Telegram
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
