import { LegalPage } from "@/components/LegalPage";
import { brand } from "@/lib/brand";

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        Hearloom sells a digital, personalized song generated from the details you provide. You
        review lyrics before a preview is made. Payment is one-time. There is no subscription.
      </p>
      <p>
        Songs are created with AI tools. You are responsible for the truth of the details you
        submit. Do not include other people&apos;s private facts they would not want in a gift.
        Output is for personal, non-commercial gifting. It is not a human-performed studio
        recording unless we say so on the product page.
      </p>
      <p>
        The private listening URL is the delivery. Keep it like a gift receipt. Contact{" "}
        {brand.supportEmail} if a page breaks.
      </p>
    </LegalPage>
  );
}
