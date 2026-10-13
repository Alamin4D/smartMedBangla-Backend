import { z } from "zod";
import { nullableText, optionalDate } from "./common.validator.js";

const fields = {
  name: z.string().trim().min(1, "Medicine name is required").max(120),
  batchNumber: nullableText(60),
  manufactureDate: optionalDate,
  expiryDate: z.coerce.date({ error: "Expiry date is required" }),
  quantity: z.coerce.number().int().min(0).max(10000).nullish(),
  imageUrl: z.url().nullish(),
  imagePublicId: z.string().max(255).nullish(),
  notes: nullableText(500),
};

export const inventoryValidator = {
  create: z.object(fields),
  update: z.object(fields).partial().extend({ isDisposed: z.boolean().optional() }),
  listQuery: z.object({
    patientId: z.string().optional(),
    status: z.enum(["all", "active", "expiring", "expired", "disposed"]).default("active"),
  }),
};
