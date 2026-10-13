import { z } from "zod";

export const careValidator = {
  invite: z.object({
    email: z.email("Enter a valid email address").trim().toLowerCase(),
    relation: z.string().trim().max(40).optional(),
  }),
  respond: z.object({ accept: z.boolean() }),
};
