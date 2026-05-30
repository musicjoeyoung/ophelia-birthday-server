CREATE TABLE "rsvps" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_name" text NOT NULL,
	"adult_name" text NOT NULL,
	"email" text NOT NULL,
	"attending" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rsvpEmailUniqueIndex" ON "rsvps" USING btree (lower("email"));