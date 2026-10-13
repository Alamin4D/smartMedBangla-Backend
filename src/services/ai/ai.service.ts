import type { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import type { AiFeature, Language } from "../../generated/prisma/enums.js";
import { AiInteractionModel } from "../../models/aiInteraction.model.js";
import { ChatMessageModel } from "../../models/chatMessage.model.js";
import { MedicineModel } from "../../models/medicine.model.js";
import type { AuthUser } from "../../types/express.js";
import { ApiError } from "../../utils/ApiError.js";
import { startOfMonth } from "../../utils/time.js";
import { cache } from "../cache.service.js";
import { doseService } from "../dose.service.js";
import { generate, parseJson, type AiImage, type GenerateOptions } from "./ai.provider.js";
import { prompts } from "./ai.prompts.js";
import {
  adherenceInsightSchema,
  interactionSchema,
  medicineInfoSchema,
  prescriptionExtractionSchema,
  stripScanSchema,
} from "./ai.schemas.js";

const SCAN_FEATURES: AiFeature[] = ["PRESCRIPTION_OCR", "EXPIRY_SCAN"];

/** Runs an AI call, validates JSON output with Zod and records usage + latency for the admin dashboard. */
async function runJson<S extends z.ZodType>(
  userId: string,
  feature: AiFeature,
  inputLabel: string,
  options: GenerateOptions,
  schema: S,
): Promise<{ data: z.infer<S>; provider: string }> {
  const startedAt = Date.now();
  let provider = "none";
  try {
    const result = await generate({ ...options, json: true });
    provider = result.provider;
    const data = schema.parse(parseJson(result.text));
    await AiInteractionModel.log({
      userId,
      feature,
      provider,
      input: inputLabel.slice(0, 2000),
      output: result.text.slice(0, 8000),
      latencyMs: Date.now() - startedAt,
    });
    return { data, provider };
  } catch (err) {
    await AiInteractionModel.log({
      userId,
      feature,
      provider,
      input: inputLabel.slice(0, 2000),
      success: false,
      error: (err as Error).message.slice(0, 500),
      latencyMs: Date.now() - startedAt,
    });
    if (err instanceof ApiError) throw err;
    throw ApiError.unavailable("The AI could not understand the response. Please try again.", "AI_BAD_OUTPUT");
  }
}

function ageFrom(dob?: Date | null) {
  if (!dob) return null;
  return Math.floor((Date.now() - dob.getTime()) / (365.25 * 86_400_000));
}

export const aiService = {
  /** Free plan users get a monthly quota of image scans (prescriptions + medicine strips). */
  async assertScanQuota(user: AuthUser) {
    if (user.plan === "PREMIUM") return;
    const used = await AiInteractionModel.countSuccessfulSince(user.id, SCAN_FEATURES, startOfMonth());
    if (used >= env.FREE_AI_SCANS_PER_MONTH) {
      throw ApiError.paymentRequired(
        `You have used all ${env.FREE_AI_SCANS_PER_MONTH} free AI scans this month. Upgrade to Premium for unlimited scans.`,
      );
    }
  },

  async scanUsage(user: AuthUser) {
    const used = await AiInteractionModel.countSuccessfulSince(user.id, SCAN_FEATURES, startOfMonth());
    return { used, limit: user.plan === "PREMIUM" ? null : env.FREE_AI_SCANS_PER_MONTH, plan: user.plan };
  },

  /** AI feature 1 – handwritten prescription OCR + structured extraction. */
  extractPrescription: (userId: string, image: AiImage) =>
    runJson(
      userId,
      "PRESCRIPTION_OCR",
      "prescription image",
      { system: prompts.prescription.system, prompt: prompts.prescription.user, images: [image] },
      prescriptionExtractionSchema,
    ),

  /** AI feature 2 – read expiry / batch info from a medicine strip photo. */
  scanMedicineStrip: (userId: string, image: AiImage) =>
    runJson(
      userId,
      "EXPIRY_SCAN",
      "medicine strip image",
      { system: prompts.stripScan.system, prompt: prompts.stripScan.user, images: [image] },
      stripScanSchema,
    ),

  /** AI feature 3 – plain-language medicine explainer (cached for 7 days). */
  async medicineInfo(userId: string, name: string, lang: Language) {
    const key = `ai:medinfo:${lang}:${name.trim().toLowerCase()}`;
    const cached = await cache.get<z.infer<typeof medicineInfoSchema>>(key);
    if (cached) return { ...cached, cached: true };

    const p = prompts.medicineInfo(name, lang);
    const { data } = await runJson(userId, "MEDICINE_INFO", name, { system: p.system, prompt: p.user }, medicineInfoSchema);
    if (data.isKnownMedicine) await cache.set(key, data, 7 * 24 * 3600);
    return { ...data, cached: false };
  },

  /** AI feature 4 – drug interaction, allergy and duplicate-therapy checker. */
  async checkInteractions(userId: string, patientId: string, extra: string[], lang: Language) {
    const [active, patient] = await Promise.all([
      MedicineModel.listActiveNames(patientId),
      prisma.user.findUnique({ where: { id: patientId }, select: { allergies: true, chronicConditions: true, dateOfBirth: true } }),
    ]);
    const names = [
      ...active.map((m) => [m.name, m.genericName && `(${m.genericName})`, m.strength].filter(Boolean).join(" ")),
      ...extra,
    ];
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length < 1) throw ApiError.badRequest("Add at least one medicine to check");

    const p = prompts.interactions(
      unique,
      { allergies: patient?.allergies ?? [], conditions: patient?.chronicConditions ?? [], age: ageFrom(patient?.dateOfBirth) },
      lang,
    );
    const { data } = await runJson(userId, "INTERACTION_CHECK", unique.join(", "), { system: p.system, prompt: p.user }, interactionSchema);
    return { checkedMedicines: unique, ...data };
  },

  /** AI feature 5 – context-aware health assistant chat with persisted history. */
  async chat(user: AuthUser, message: string, lang: Language) {
    const history = await ChatMessageModel.history(user.id, 12);
    const context = await buildChatContext(user);

    const startedAt = Date.now();
    await ChatMessageModel.create(user.id, "USER", message);
    try {
      const result = await generate({
        system: prompts.chat(context, lang),
        prompt: message,
        history: history.map((m) => ({ role: m.role === "USER" ? "user" : "assistant", text: m.content })),
        temperature: 0.5,
      });
      const reply = await ChatMessageModel.create(user.id, "ASSISTANT", result.text);
      await AiInteractionModel.log({
        userId: user.id,
        feature: "HEALTH_CHAT",
        provider: result.provider,
        input: message.slice(0, 2000),
        output: result.text.slice(0, 8000),
        latencyMs: Date.now() - startedAt,
      });
      return reply;
    } catch (err) {
      await AiInteractionModel.log({
        userId: user.id,
        feature: "HEALTH_CHAT",
        provider: "none",
        input: message.slice(0, 2000),
        success: false,
        error: (err as Error).message.slice(0, 500),
        latencyMs: Date.now() - startedAt,
      });
      throw err;
    }
  },

  chatHistory: (userId: string) => ChatMessageModel.history(userId, 100),
  clearChat: (userId: string) => ChatMessageModel.clear(userId),

  /** AI feature 6 – adherence analysis with personalised tips (for patients and caregivers). */
  async adherenceInsight(userId: string, patientId: string, lang: Language) {
    const stats = await doseService.stats(patientId, 30);
    const counted = stats.totals.taken + stats.totals.missed + stats.totals.skipped;
    if (counted === 0) {
      throw ApiError.badRequest("Not enough dose history yet. Insights appear after a few days of reminders.");
    }
    const summary = [
      `Overall adherence: ${stats.adherenceRate}% (${stats.totals.taken} taken, ${stats.totals.missed} missed, ${stats.totals.skipped} skipped)`,
      `Current perfect-day streak: ${stats.streakDays} day(s)`,
      `By time of day: ${stats.byTimeOfDay.map((s) => `${s.slot} ${s.rate}% of ${s.total}`).join("; ")}`,
      `By medicine: ${stats.byMedicine.map((m) => `${m.name} ${m.rate}% of ${m.total}`).join("; ")}`,
      `Last 7 days: ${stats.daily
        .slice(-7)
        .map((d) => `${d.date} taken ${d.taken}/missed ${d.missed}`)
        .join("; ")}`,
    ].join("\n");

    const p = prompts.adherence(summary, lang);
    const { data } = await runJson(userId, "ADHERENCE_INSIGHT", summary, { system: p.system, prompt: p.user }, adherenceInsightSchema);
    return { stats: { adherenceRate: stats.adherenceRate, streakDays: stats.streakDays, totals: stats.totals }, ...data };
  },
};

async function buildChatContext(user: AuthUser) {
  if (user.role !== "PATIENT") {
    return `The user is a ${user.role.toLowerCase()} named ${user.name}. They care for patients using SmartMed.`;
  }
  const [profile, medicines] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, dateOfBirth: true, gender: true, allergies: true, chronicConditions: true },
    }),
    MedicineModel.listActiveNames(user.id),
  ]);
  return [
    `Name: ${profile?.name}`,
    `Age: ${ageFrom(profile?.dateOfBirth) ?? "unknown"}, gender: ${profile?.gender ?? "unknown"}`,
    `Allergies: ${profile?.allergies.join(", ") || "none recorded"}`,
    `Chronic conditions: ${profile?.chronicConditions.join(", ") || "none recorded"}`,
    `Current medicines: ${
      medicines.map((m) => `${m.name}${m.strength ? ` ${m.strength}` : ""} (${m.dosagePattern ?? "as directed"}, ${m.mealTiming})`).join("; ") ||
      "none"
    }`,
  ].join("\n");
}
