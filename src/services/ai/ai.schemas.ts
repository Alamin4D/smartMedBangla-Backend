/**
 * Zod schemas that validate (and repair) structured AI output before it touches the database.
 * `.catch()` keeps one malformed field from discarding the whole answer.
 */
import { z } from "zod";

const text = z.string().trim().nullish().catch(null);
const list = z.array(z.string().trim()).catch([]);

export const mealTimingSchema = z.enum(["BEFORE_MEAL", "AFTER_MEAL", "WITH_MEAL", "ANY"]).catch("ANY");

export const extractedMedicineSchema = z.object({
  name: z.string().trim().min(1),
  genericName: text,
  strength: text,
  form: text,
  dosagePattern: text,
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).catch([]),
  quantity: z.string().trim().nullish().catch("1"),
  mealTiming: mealTimingSchema,
  durationDays: z.coerce.number().int().positive().max(3650).nullish().catch(null),
  instructions: text,
  instructionsBn: text,
});

export const prescriptionExtractionSchema = z.object({
  isPrescription: z.boolean().catch(true),
  doctorName: text,
  hospital: text,
  prescribedDate: text,
  diagnosis: text,
  advice: text,
  rawText: text,
  summaryBn: text,
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  medicines: z.array(extractedMedicineSchema.nullable().catch(null)).catch([]),
});
export type PrescriptionExtraction = z.infer<typeof prescriptionExtractionSchema>;
export type ExtractedMedicine = z.infer<typeof extractedMedicineSchema>;

export const stripScanSchema = z.object({
  isMedicine: z.boolean().catch(true),
  name: text,
  genericName: text,
  strength: text,
  batchNumber: text,
  manufactureDate: text,
  expiryDate: text,
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
});
export type StripScan = z.infer<typeof stripScanSchema>;

export const medicineInfoSchema = z.object({
  name: z.string().catch(""),
  genericName: text,
  category: text,
  summary: z.string().catch(""),
  uses: list,
  howToTake: text,
  sideEffects: list,
  seriousWarnings: list,
  avoid: list,
  storage: text,
  isKnownMedicine: z.boolean().catch(true),
});
export type MedicineInfo = z.infer<typeof medicineInfoSchema>;

export const interactionSchema = z.object({
  overallRisk: z.enum(["LOW", "MODERATE", "HIGH", "UNKNOWN"]).catch("UNKNOWN"),
  summary: z.string().catch(""),
  interactions: z
    .array(
      z.object({
        medicines: list,
        severity: z.enum(["MINOR", "MODERATE", "MAJOR"]).catch("MODERATE"),
        description: z.string().catch(""),
        recommendation: z.string().catch(""),
      }),
    )
    .catch([]),
  allergyWarnings: list,
  duplicateTherapy: list,
  generalAdvice: list,
});
export type InteractionReport = z.infer<typeof interactionSchema>;

export const adherenceInsightSchema = z.object({
  headline: z.string().catch(""),
  riskLevel: z.enum(["GOOD", "FAIR", "POOR"]).catch("FAIR"),
  insights: list,
  tips: list,
  caregiverNote: text,
});
export type AdherenceInsight = z.infer<typeof adherenceInsightSchema>;
