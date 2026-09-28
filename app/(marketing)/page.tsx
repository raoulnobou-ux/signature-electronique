import { BeforeAfter } from "@/components/marketing/before-after";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PricingSection } from "@/components/marketing/pricing-section";
import { Testimonials } from "@/components/marketing/testimonials";
import { UseCases } from "@/components/marketing/use-cases";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <BeforeAfter />
      <HowItWorks />
      <Features />
      <UseCases />
      <PricingSection />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
