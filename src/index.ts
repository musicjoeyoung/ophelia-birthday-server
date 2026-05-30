import * as schema from "./db/schema";

import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";

import { HTTPException } from "hono/http-exception";
import { Hono } from "hono";
import { ZRsvpInsert } from "./dtos";
import { cors } from "hono/cors";
import { dbProvider } from "./middleware/dbProvider";
import { zodValidator } from "./middleware/validator";

// ── Public RSVP routes ────────────────────────────────────────────────────────
const api = new Hono()
  .use("*", dbProvider)
  .post("/rsvp", zodValidator("json", ZRsvpInsert), async (c) => {
    const db = c.var.db;
    const { child_name, child_name_2, adult_name, adult_name_2, email, attending, message } = c.req.valid("json");

    try {
      const [rsvp] = await db
        .insert(schema.rsvps)
        .values({
          childName: child_name,
          childName2: child_name_2 ?? null,
          adultName: adult_name ?? '',
          adultName2: adult_name_2 ?? null,
          email: email.toLowerCase(),
          attending,
          message: message ?? null,
        })
        .returning();

      if (attending) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Ophelia's Birthday <rsvp@ophelia-birthday.com>",
            to: email,
            subject: "You're on the list! 🎉",
            html: `
              <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #c13b6c;">
                <h1 style="font-size: 1.8rem; margin-bottom: 0.5rem;">You're coming! 🌈</h1>
                <p style="font-size: 1.1rem; color: #555;">Hi ${adult_name_2 ? `${adult_name} & ${adult_name_2}` : adult_name},</p>
                <p style="color: #555;">We're so excited to celebrate Ophelia's 5th birthday with you and ${child_name}!</p>
                <div style="background: #fdf3e7; border-radius: 12px; padding: 1rem 1.25rem; margin: 1.5rem 0; color: #333;">
                  <p><strong>🕚 Time:</strong> 11:00 am – 1:00 PM</p>
                  <p><strong>📍 Where:</strong> Little Pulp, 8016 Cooper Avenue, Glendale, NY 11385</p>
                </div>
                <p style="color: #555;">Can't wait to see you there!</p>
                <p style="color: #c13b6c; font-weight: bold;">With love, Ophelia's family 💕</p>
              </div>
            `,
          }),
        });
      }

      return c.json({ success: true, id: rsvp.id }, 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return c.json({ message: "You've already RSVP'd with that email!" }, 409);
      }
      throw err;
    }
  });

// ── Admin routes ──────────────────────────────────────────────────────────────
type AdminBindings = { ADMIN_PASSWORD: string; RESEND_API_KEY: string; DATABASE_URL: string };

const admin = new Hono<{ Bindings: AdminBindings }>()
  .use("*", dbProvider)
  // Login — validate password, return it as the bearer token
  .post("/login", async (c) => {
    const { password } = await c.req.json<{ password?: string }>();
    if (!password || password !== c.env.ADMIN_PASSWORD) {
      return c.json({ message: "Invalid password" }, 401);
    }
    return c.json({ token: c.env.ADMIN_PASSWORD });
  })
  // All routes below require a valid token
  .use("*", async (c, next) => {
    const auth = c.req.header("Authorization");
    if (!auth || auth !== `Bearer ${c.env.ADMIN_PASSWORD}`) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    await next();
  })
  .get("/rsvps", async (c) => {
    const db = c.var.db;
    const rows = await db
      .select()
      .from(schema.rsvps)
      .orderBy(schema.rsvps.createdAt);
    return c.json(rows);
  })
  .post("/send-email", async (c) => {
    const { emails, subject, html } = await c.req.json<{
      emails: string[];
      subject: string;
      html: string;
    }>();

    if (!emails?.length || !subject?.trim() || !html?.trim()) {
      return c.json({ message: "emails, subject, and html are required" }, 400);
    }

    const results: { email: string; ok: boolean }[] = [];
    for (const to of emails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ophelia's Birthday <rsvp@ophelia-birthday.com>",
          to,
          subject,
          html,
        }),
      });
      results.push({ email: to, ok: res.ok });
    }

    const failed = results.filter((r) => !r.ok).map((r) => r.email);
    return c.json({ sent: results.length - failed.length, failed });
  });

const app = new Hono()
  .use(
    "*",
    cors({
      origin: ["https://ophelia-birthday.com", "https://www.ophelia-birthday.com", "https://ophelia-birthday.netlify.app", "http://localhost:5173"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .get("/", (c) => {
    return c.text("Ophelia's Birthday API 🎉");
  })
  .route("/api", api)
  .route("/api/admin", admin);

app.onError((error, c) => {
  console.error(error);
  if (error instanceof HTTPException) {
    return c.json(
      {
        message: error.message,
      },
      error.status,
    );
  }

  return c.json(
    {
      message: "Something went wrong",
    },
    500,
  );
});

/**
 * Serve a simplified api specification for your API
 * As of writing, this is just the list of routes and their methods.
 */
app.get("/openapi.json", (c) => {
  return c.json(
    createOpenAPISpec(app, {
      info: {
        title: "HONC Neon App",
        version: "1.0.0",
      },
    }),
  );
});

/**
 * Mount the Fiberplane api explorer to be able to make requests against your API.
 *
 * Visit the explorer at `/fp`
 */
app.use(
  "/fp/*",
  createFiberplane({
    app,
    openapi: { url: "/openapi.json" },
  }),
);

export default app;
