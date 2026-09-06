import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useCompleteOnboardingMutation } from "../mutations/useCompleteOnboardingMutation";

const schema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name to continue."),
});
type FormValues = z.infer<typeof schema>;

export function OnboardingPage() {
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "" },
  });
  const save = useCompleteOnboardingMutation();
  return (
    <main className="onboarding-shell">
      <section className="onboarding-card" aria-labelledby="welcome-title">
        <p className="wordmark">taffy</p>
        <p className="eyebrow">A calm place to keep what you learn</p>
        <h1 id="welcome-title">What should taffy call you?</h1>
        <p className="lede">Your name stays on this device and can be changed later.</p>
        <form
          onSubmit={form.handleSubmit((values) => {
            setFailure(null);
            save.mutate(values, {
              onError: () =>
                setFailure(
                  "Taffy could not save your name. Your entry is still here—please try again.",
                ),
            });
          })}
          noValidate
        >
          <label htmlFor="display-name">Display name</label>
          <Input
            id="display-name"
            autoFocus
            autoComplete="name"
            aria-invalid={Boolean(form.formState.errors.displayName)}
            aria-describedby="display-name-error"
            {...form.register("displayName")}
          />
          <p id="display-name-error" className="field-error" role="alert">
            {form.formState.errors.displayName?.message}
          </p>
          {failure && (
            <p className="failure" role="alert">
              {failure}
            </p>
          )}
          <Button className="onboarding-submit-button" type="submit" disabled={save.isPending}>
            Continue <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </form>
      </section>
    </main>
  );
}
