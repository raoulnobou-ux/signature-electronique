import { Briefcase, Building2, GraduationCap, Landmark, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Section, SectionHeading } from "./section";

const icons: Record<string, LucideIcon> = {
  firm: Briefcase,
  school: GraduationCap,
  business: Building2,
  admin: Landmark,
};

type UseCase = { key: string; tab: string; title: string; description: string; examples: string[] };

export async function UseCases() {
  const t = await getTranslations("landing.useCases");
  const items = t.raw("items") as UseCase[];
  const first = items[0]?.key ?? "firm";

  return (
    <Section labelledBy="usecases-title">
      <SectionHeading id="usecases-title" eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs defaultValue={first} className="reveal mt-12">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex sm:justify-center sm:px-0">
          <TabsList className="w-max min-w-full sm:min-w-0">
            {items.map((item) => {
              const Icon = icons[item.key] ?? Briefcase;
              return (
                <TabsTrigger key={item.key} value={item.key}>
                  <Icon aria-hidden />
                  {item.tab}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
        {items.map((item) => {
          const Icon = icons[item.key] ?? Briefcase;
          return (
            <TabsContent key={item.key} value={item.key} className="mt-8">
              <div className="grid gap-8 rounded-3xl glass p-6 sm:p-10 md:grid-cols-[1.2fr_1fr] md:items-center">
                <div className="space-y-4">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white">
                    <Icon className="size-6" aria-hidden />
                  </div>
                  <h3 className="font-display text-2xl font-semibold sm:text-3xl">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
                <ul className="grid grid-cols-2 gap-3">
                  {item.examples.map((example) => (
                    <li
                      key={example}
                      className="flex min-h-20 flex-col justify-between gap-3 rounded-2xl border border-border bg-background-elevated/60 p-4 text-sm font-medium"
                    >
                      <span className="h-1.5 w-8 rounded-full bg-brand-gradient" aria-hidden />
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </Section>
  );
}
