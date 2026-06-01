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
    childName2: text(),
    adultName: text().notNull(),
    adultName2: text(),
    email: text().notNull(),
    attending: boolean().notNull(),
    message: text(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex("rsvpEmailUniqueIndex").on(lower(table.email))],
);

export type NewInvitee = typeof invitees.$inferInsert;
export type Invitee = typeof invitees.$inferSelect;

export const invitees = pgTable("invitees", {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: text(),
  notes: text(),
  createdAt: timestamp().defaultNow().notNull(),
});
