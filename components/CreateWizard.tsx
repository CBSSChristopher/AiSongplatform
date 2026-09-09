"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  genres,
  occasions,
  relationships,
  voices,
  type OccasionId,
} from "@/lib/brand";

const steps = ["Person", "Sound", "Story", "Message", "Review"] as const;

type FormState = {
  recipientName: string;
  relationship: string;
  email: string;
  marketingOptIn: boolean;
  genre: string;
  voice: string;
  qualities: string;
  memories: string;
  occasion: string;
  senderName: string;
  message: string;
};

const empty: FormState = {
  recipientName: "",
  relationship: "",
  email: "",
  marketingOptIn: false,
  genre: "acoustic",
  voice: "any",
  qualities: "",
  memories: "",
  occasion: "just-because",
  senderName: "",
  message: "",
};

export function CreateWizard({ occasion }: { occasion?: string }) {
  const router = useRouter();
  const initial = useMemo(() => {
    const match = occasions.some((item) => item.id === occasion);
    return {
      ...empty,
      occasion: match ? (occasion as OccasionId) : "just-because",
    };
  }, [occasion]);
  const [form, setForm] = useState<FormState>(initial);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateStep() {
    if (step === 0) {
      if (!form.relationship) return "Choose who this is for.";
      if (!form.recipientName.trim()) return "Add the name we should sing.";
      if (!form.email.includes("@")) return "Add the email for your private song link.";
    }
    return "";
  }

  async function next() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (step < steps.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await response.json()) as { error?: string; job?: { id: string } };
      if (!response.ok) throw new Error(json.error || "Could not save your story.");
      const lyrics = await fetch(`/api/jobs/${json.job?.id}/lyrics`, { method: "POST" });
      const lyricJson = (await lyrics.json()) as { error?: string };
      if (!lyrics.ok) throw new Error(lyricJson.error || "Could not draft lyrics.");
      router.push(`/preview/${json.job?.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm md:p-8">
      <p className="text-sm text-[var(--muted)]">
        Step {step + 1} of {steps.length} · {steps[step]}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className="h-full bg-[var(--copper)]"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      {step === 0 && (
        <section className="mt-6 space-y-5">
          <h1 className="serif text-3xl">Who is this song for?</h1>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {relationships.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => set("relationship", item.id)}
                className={`rounded-2xl border px-3 py-3 text-left ${
                  form.relationship === item.id
                    ? "border-[var(--copper)] bg-[#f8e7db]"
                    : "border-[var(--line)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-sm">The name to sing</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              placeholder="Maya, or Alina (ah-LEE-na)"
              value={form.recipientName}
              onChange={(event) => set("recipientName", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm">Your email</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              placeholder="you@example.com"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={form.marketingOptIn}
              onChange={(event) => set("marketingOptIn", event.target.checked)}
            />
            Email me song reminders and occasional offers. I can unsubscribe anytime.
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="mt-6 space-y-5">
          <h1 className="serif text-3xl">What should it sound like?</h1>
          <div className="grid grid-cols-2 gap-2">
            {genres.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => set("genre", item.id)}
                className={`rounded-2xl border px-3 py-3 text-left ${
                  form.genre === item.id
                    ? "border-[var(--copper)] bg-[#f8e7db]"
                    : "border-[var(--line)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {voices.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => set("voice", item.id)}
                className={`rounded-2xl border px-3 py-3 ${
                  form.voice === item.id
                    ? "border-[var(--copper)] bg-[#f8e7db]"
                    : "border-[var(--line)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6 space-y-5">
          <h1 className="serif text-3xl">What makes them, them?</h1>
          <label className="block">
            <span className="text-sm">A few true qualities</span>
            <textarea
              className="mt-1 min-h-24 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              placeholder="Kind, stubborn about Sunday pancakes, always early."
              value={form.qualities}
              onChange={(event) => set("qualities", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm">One memory or tradition</span>
            <textarea
              className="mt-1 min-h-28 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              placeholder="The beach walk where you found the seashell. Keep it specific."
              value={form.memories}
              onChange={(event) => set("memories", event.target.value)}
            />
          </label>
        </section>
      )}

      {step === 3 && (
        <section className="mt-6 space-y-5">
          <h1 className="serif text-3xl">What should they hear?</h1>
          <label className="block">
            <span className="text-sm">Occasion</span>
            <select
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              value={form.occasion}
              onChange={(event) => set("occasion", event.target.value)}
            >
              {occasions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm">Who is it from?</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              value={form.senderName}
              onChange={(event) => set("senderName", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm">The one thing you want them to know</span>
            <textarea
              className="mt-1 min-h-28 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3"
              value={form.message}
              onChange={(event) => set("message", event.target.value)}
            />
          </label>
        </section>
      )}

      {step === 4 && (
        <section className="mt-6 space-y-4">
          <h1 className="serif text-3xl">One last look</h1>
          <dl className="space-y-2 text-sm">
            <div>For {form.recipientName || "—"} · {form.relationship || "—"}</div>
            <div>Sound {form.genre} · {form.voice}</div>
            <div>Occasion {form.occasion}</div>
            <div className="text-[var(--muted)]">{form.memories || "No memory added yet."}</div>
          </dl>
          <p className="text-sm text-[var(--muted)]">
            We&apos;ll draft lyrics next. You can edit them before we make the free preview.
            No card needed.
          </p>
        </section>
      )}

      {error ? <p className="mt-4 text-sm text-[var(--copper-dark)]">{error}</p> : null}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          className="text-sm text-[var(--muted)]"
          onClick={() => {
            setError("");
            setStep((value) => Math.max(0, value - 1));
          }}
          disabled={step === 0 || busy}
        >
          Back
        </button>
        <button
          type="button"
          onClick={next}
          disabled={busy}
          className="rounded-full bg-[var(--copper)] px-5 py-3 text-white disabled:opacity-60"
        >
          {busy ? "Writing lyrics…" : step === steps.length - 1 ? "Create my lyrics" : "Continue"}
        </button>
      </div>
    </div>
  );
}
