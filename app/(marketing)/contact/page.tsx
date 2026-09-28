import { Clock, Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/providers/client-messages";
import { AmbientBackground } from "@/components/brand/ambient-background";
import { Card, CardContent } from "@/components/ui/card";
import { siteConfig } from "@/lib/site";
import { ContactForm } from "./contact-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contact");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ContactPage() {
  const t = await getTranslations("contact");
  const channels = [
    {
      icon: Mail,
      title: t("emailTitle"),
      body: (
        <a
          href={`mailto:${siteConfig.supportEmail}`}
          className="text-accent-foreground hover:underline"
        >
          {siteConfig.supportEmail}
        </a>
      ),
    },
    { icon: MessageCircle, title: t("whatsappTitle"), body: t("whatsappDescription") },
    { icon: Clock, title: t("hoursTitle"), body: t("hours") },
  ];

  return (
    <div className="relative isolate">
      <AmbientBackground intensity="subtle" />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("title")}
            </h1>
            <p className="text-muted-foreground sm:text-lg">{t("subtitle")}</p>
          </div>
          <ul className="space-y-4">
            {channels.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent">
                  <Icon className="size-5 text-accent-foreground" aria-hidden />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <ClientMessages namespaces={["contact.form"]}>
              <ContactForm />
            </ClientMessages>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
