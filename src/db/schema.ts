import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const lower = (email: AnyPgColumn): SQL => {
  return sql`lower(${email})`;
};

export type NewRsvp = typeof rsvps.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;

export const rsvps = pgTable(
  "rsvps",
  {
    id: serial().primaryKey(),
    childName: text().notNull(),
    adultName: text().notNull(),
    email: text().notNull(),
    attending: boolean().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex("rsvpEmailUniqueIndex").on(lower(table.email))],
);
