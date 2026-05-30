import { z } from "zod";

export const ZRsvpInsert = z.object({
  child_name: z.string().min(1, "Child name is required"),
  adult_name: z.string().min(1, "Adult name is required"),
  email: z.email("A valid email address is required"),
  attending: z.boolean(),
});
