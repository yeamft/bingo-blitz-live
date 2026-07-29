import { useState } from "react";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { getErrorMessage } from "@/lib/api";

export function PhoneCompletionBanner() {
  const { player, loading, needsPhoneNumber, completePhoneRegistration } = useTelegramIdentity();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading || !player || !needsPhoneNumber) return null;

  async function handleSubmit() {
    const cleaned = phone.trim();
    if (!cleaned) {
      toast.error("Enter your phone number to complete your account");
      return;
    }

    setSubmitting(true);
    try {
      await completePhoneRegistration(cleaned);
      toast.success("Phone number saved");
      setPhone("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sticky top-0 z-30 border-b border-warning/30 bg-warning/10 backdrop-blur">
      <div className="max-w-md mx-auto px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Phone className="h-4 w-4 text-warning" />
          <span>Complete your account with a phone number for withdrawals and support.</span>
        </div>
        <div className="flex gap-2 sm:min-w-[240px] sm:ml-auto">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="2519..."
            className="h-9 bg-background"
          />
          <Button onClick={handleSubmit} disabled={submitting} className="h-9 whitespace-nowrap">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}