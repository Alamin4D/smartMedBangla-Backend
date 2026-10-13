import { z } from "zod";
import { nullableText, optionalDate } from "./common.validator.js";
import { medicineFields, reminderInput } from "./medicine.validator.js";

const metadata = {
  title: nullableText(120),
  doctorName: nullableText(120),
  hospital: nullableText(160),
  prescribedDate: optionalDate,
  diagnosis: nullableText(500),
  advice: nullableText(1000),
  notes: nullableText(1000),
};

export const prescriptionValidator = {
  upload: z.object({ title: nullableText(120) }),
  update: z.object(metadata),
  confirm: z.object({
    ...metadata,
    medicines: z
      .array(medicineFields.extend({ reminders: z.array(reminderInput).max(8).default([]) }))
      .max(30, "Too many medicines"),
  }),
  listQuery: z.object({
    patientId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    search: z.string().trim().max(100).optional(),
    status: z.enum(["PROCESSING", "PROCESSED", "VERIFIED", "FAILED"]).optional(),
  }),
};

export type PrescriptionConfirmInput = z.infer<typeof prescriptionValidator.confirm>;
