import { LegalPage } from "@/components/LegalPage";
import { brand } from "@/lib/brand";

export default function RefundsPage() {
  return (
    <LegalPage title="Refunds">
      <p>
        The preview is free. You hear it before you pay. Because the full song is a custom
        digital file made from your details, refunds are limited.
      </p>
      <p>
        If checkout charged you and the private page never unlocked, or the file will not play,
        email {brand.supportEmail} with the song link. We will fix delivery or refund through
        Whop.
      </p>
      <p>
        If you simply changed your mind after listening to a working full song, we generally do
        not refund. Whop&apos;s receipt is the payment record.
      </p>
    </LegalPage>
  );
}
