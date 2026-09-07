import { LegalPage } from "@/components/LegalPage";
import { brand } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        Hearloom collects the story details you type (names, memories, message), the email you
        give for delivery, and optional marketing opt-in. We use those details to draft lyrics,
        make a preview, fulfill a paid song, and send the private listening link.
      </p>
      <p>
        Lyrics may be generated with a third-party AI provider. Payments are handled by Whop.
        Hearloom does not store card numbers. Audio and job records are kept so you can reopen
        your private page.
      </p>
      <p>
        Marketing email is optional. Transactional delivery email is sent because you asked for
        the song. Questions: {brand.supportEmail}.
      </p>
    </LegalPage>
  );
}
