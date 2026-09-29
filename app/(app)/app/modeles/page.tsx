import { LayoutTemplate } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app/page-header";
import { ProUpsell } from "@/components/app/pro-upsell";
import { TemplatesView } from "@/components/templates/templates-view";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { templateFieldSchema, templateRoleSchema } from "@/lib/templates/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates");
  return { title: t("metaTitle") };
}

export default async function TemplatesPage() {
  const [account, t, supabase] = await Promise.all([
    requireAccount(),
    getTranslations("templates"),
    createClient(),
  ]);
  const allowed = account.entitlements.features.templates;
  const [{ data: templates }, { data: membership }] = await Promise.all([
    supabase.from("templates").select("*").order("updated_at", { ascending: false }).limit(200),
    supabase.from("team_members").select("team_id").eq("user_id", account.userId).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("title")} description={t("description")} />
      {!allowed ? (
        <ProUpsell
          icon={LayoutTemplate}
          title={t("proTitle")}
          text={t("proText")}
          cta={t("upgrade")}
        />
      ) : (
        <TemplatesView
          inTeam={Boolean(membership)}
          templates={(templates ?? []).map((tpl) => {
            const fields = templateFieldSchema.array().safeParse(tpl.fields);
            const roles = templateRoleSchema.array().safeParse(tpl.roles);
            return {
              id: tpl.id,
              name: tpl.name,
              description: tpl.description,
              pageCount: tpl.page_count ?? 0,
              roles: roles.success ? roles.data.map((r) => r.label) : [],
              variables: fields.success
                ? fields.data
                    .filter((f) => f.variable)
                    .map((f) => ({
                      id: f.id,
                      label: f.value || t("variable"),
                      required: f.required,
                    }))
                : [],
              zones: fields.success ? fields.data.length : 0,
              useCount: tpl.use_count,
              mine: tpl.owner_id === account.userId,
              shared: Boolean(tpl.team_id),
              updatedAt: tpl.updated_at,
            };
          })}
        />
      )}
    </div>
  );
}
