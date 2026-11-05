/**
 * Server functions for Subscription Plan Management console and customer pricing synchronization.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import { assertAdminAccess } from "./user-management.functions";

export type PlanCode = "free" | "pro_monthly" | "pro_annual" | "institutional";

export interface PlanFeatures {
  liveCandles: boolean;
  gammaGex: boolean;
  aiAssistant: boolean;
  telegramDispatch: boolean;
  astroHarmonics: boolean;
  backtestLab: boolean;
  prioritySupport: boolean;
}

export interface SubscriptionPlanItem {
  id: string;
  name: string;
  code: PlanCode;
  priceInr: number;
  billingCycle: "monthly" | "annual" | "lifetime";
  validityDays: number;
  isActive: boolean;
  sortOrder: number;
  description: string;
  badge?: string;
  features: PlanFeatures;
  updatedAt?: string;
}

export const DEFAULT_PLANS: SubscriptionPlanItem[] = [
  {
    id: "plan_free",
    name: "Free Researcher",
    code: "free",
    priceInr: 0,
    billingCycle: "lifetime",
    validityDays: 3650,
    isActive: true,
    sortOrder: 1,
    description: "Essential Astro Level calculations, historical daily charts, and basic trading journal.",
    features: {
      liveCandles: false,
      gammaGex: false,
      aiAssistant: false,
      telegramDispatch: false,
      astroHarmonics: true,
      backtestLab: false,
      prioritySupport: false,
    },
  },
  {
    id: "plan_pro_monthly",
    name: "Pro Monthly",
    code: "pro_monthly",
    priceInr: 999,
    billingCycle: "monthly",
    validityDays: 30,
    isActive: true,
    sortOrder: 2,
    badge: "Popular",
    description: "Sub-second live streaming candles, AI Market Assistant, automated Telegram dispatch, and Astro Harmonics.",
    features: {
      liveCandles: true,
      gammaGex: false,
      aiAssistant: true,
      telegramDispatch: true,
      astroHarmonics: true,
      backtestLab: true,
      prioritySupport: false,
    },
  },
  {
    id: "plan_pro_annual",
    name: "Pro Annual",
    code: "pro_annual",
    priceInr: 9990,
    billingCycle: "annual",
    validityDays: 365,
    isActive: true,
    sortOrder: 3,
    badge: "Best Value (Save 17%)",
    description: "Full Pro intelligence suite billed annually with priority server queue and high-speed execution.",
    features: {
      liveCandles: true,
      gammaGex: false,
      aiAssistant: true,
      telegramDispatch: true,
      astroHarmonics: true,
      backtestLab: true,
      prioritySupport: true,
    },
  },
  {
    id: "plan_institutional",
    name: "Institutional Desk",
    code: "institutional",
    priceInr: 24990,
    billingCycle: "annual",
    validityDays: 365,
    isActive: true,
    sortOrder: 4,
    badge: "Institutional",
    description: "Full Net Gamma Exposure (GEX), Live Option Chain Matrix, multi-index scalping desk, and VIP quantitative support.",
    features: {
      liveCandles: true,
      gammaGex: true,
      aiAssistant: true,
      telegramDispatch: true,
      astroHarmonics: true,
      backtestLab: true,
      prioritySupport: true,
    },
  },
];

let inMemoryPlans: SubscriptionPlanItem[] = [...DEFAULT_PLANS];

function getPlansFilePath(): string {
  return path.resolve(process.cwd(), "config", "subscription-plans.json");
}

function loadPlansFromFile(): SubscriptionPlanItem[] {
  try {
    const filePath = getPlansFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryPlans = parsed;
        return inMemoryPlans;
      }
    }
  } catch {
    // Return in-memory fallback
  }
  return inMemoryPlans;
}

function savePlansToFile(plans: SubscriptionPlanItem[]): void {
  try {
    const filePath = getPlansFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(plans, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Plans] Could not persist plans to filesystem:", e);
  }
}

/** Public reader for pricing route */
export const getActiveSubscriptionPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<SubscriptionPlanItem[]> => {
    const plans = loadPlansFromFile();
    return plans.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  },
);

/** Admin reader returning all plans including inactive */
export const listPlansAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionPlanItem[]> => {
    await assertAdminAccess(context);
    const plans = loadPlansFromFile();
    return [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
  });

const savePlanSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  code: z.enum(["free", "pro_monthly", "pro_annual", "institutional"]),
  priceInr: z.number().min(0),
  billingCycle: z.enum(["monthly", "annual", "lifetime"]),
  validityDays: z.number().int().min(1),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(1),
  description: z.string(),
  badge: z.string().optional(),
  features: z.object({
    liveCandles: z.boolean(),
    gammaGex: z.boolean(),
    aiAssistant: z.boolean(),
    telegramDispatch: z.boolean(),
    astroHarmonics: z.boolean(),
    backtestLab: z.boolean(),
    prioritySupport: z.boolean(),
  }),
});

export const savePlanAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => savePlanSchema.parse(v))
  .handler(async ({ data, context }): Promise<SubscriptionPlanItem> => {
    await assertAdminAccess(context);
    const plans = loadPlansFromFile();
    const existingIndex = plans.findIndex((p) => p.id === data.id || p.code === data.code);

    const updatedPlan: SubscriptionPlanItem = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      plans[existingIndex] = updatedPlan;
    } else {
      plans.push(updatedPlan);
    }

    inMemoryPlans = plans;
    savePlansToFile(plans);

    // Optional Supabase table sync
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin.from as any)("subscription_plans").upsert({
        id: updatedPlan.id,
        name: updatedPlan.name,
        code: updatedPlan.code,
        price_inr: updatedPlan.priceInr,
        billing_cycle: updatedPlan.billingCycle,
        features: updatedPlan.features as never,
        is_active: updatedPlan.isActive,
        sort_order: updatedPlan.sortOrder,
      });
    } catch {
      // Ignored if table not created
    }

    return updatedPlan;
  });

const togglePlanStatusSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
});

export const togglePlanStatusAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => togglePlanStatusSchema.parse(v))
  .handler(async ({ data, context }): Promise<{ success: boolean; id: string; isActive: boolean }> => {
    await assertAdminAccess(context);
    const plans = loadPlansFromFile();
    const plan = plans.find((p) => p.id === data.id);
    if (!plan) throw new Error(`Plan with ID ${data.id} not found`);

    plan.isActive = data.isActive;
    plan.updatedAt = new Date().toISOString();
    inMemoryPlans = plans;
    savePlansToFile(plans);

    return { success: true, id: data.id, isActive: data.isActive };
  });
