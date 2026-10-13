import { z } from "zod";
import { boolQuery, nullableText, optionalDate, timeHHmm } from "./common.validator.js";

export const reminderInput = z.object({
  id: z.string().optional(),
  time: timeHHmm,
  quantity: z.string().trim().min(1).max(20).default("1"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  isActive: z.boolean().default(true),
});

const mealTiming = z.enum(["BEFORE_MEAL", "AFTER_MEAL", "WITH_MEAL", "ANY"]);

export const medicineFields = z.object({
  name: z.string().trim().min(1, "Medicine name is required").max(120),
  genericName: nullableText(120),
  strength: nullableText(40),
  form: nullableText(40),
  dosagePattern: nullableText(20),
  instructions: nullableText(500),
  instructionsBn: nullableText(500),
  mealTiming: mealTiming.default("ANY"),
  durationDays: z.coerce.number().int().positive().max(3650).nullish(),
  startDate: z.coerce.date().optional(),
  endDate: optionalDate,
});

export const medicineValidator = {
  create: medicineFields.extend({
    reminders: z.array(reminderInput).max(8, "At most 8 reminders per medicine").default([]),
  }),
  update: medicineFields.partial().extend({
    isActive: z.boolean().optional(),
    reminders: z.array(reminderInput).max(8).optional(),
  }),
  listQuery: z.object({
    patientId: z.string().optional(),
    active: boolQuery,
    search: z.string().trim().max(100).optional(),
  }),
};

export type MedicineCreateInput = z.infer<typeof medicineValidator.create>;
export type MedicineUpdateInput = z.infer<typeof medicineValidator.update>;
export type ReminderInput = z.infer<typeof reminderInput>;
