"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prepareDemoScenario } from "@/lib/demo-scenario";
import { requireDemoSession } from "@/lib/security/session";

export async function prepareDemoAction() {
  await requireDemoSession();
  const opportunityId = await prepareDemoScenario();
  revalidatePath("/oportunidades");
  revalidatePath("/demo");
  redirect(`/oportunidades/${opportunityId}`);
}
