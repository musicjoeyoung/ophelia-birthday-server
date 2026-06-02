import { z } from "zod";

export const ZRsvpInsert = z.object({
  child_name: z.string().optional(),
  child_name_2: z.string().optional(),
  adult_name: z.string().optional(),
  adult_name_2: z.string().optional(),
  email: z.email("A valid email address is required"),
  attending: z.boolean(),
  message: z.string().optional(),
});
