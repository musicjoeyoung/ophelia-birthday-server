import * as schema from "./db/schema";

import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";

import { HTTPException } from "hono/http-exception";
import { Hono } from "hono";
import { ZRsvpInsert } from "./dtos";
import { cors } from "hono/cors";
import { dbProvider } from "./middleware/dbProvider";
import { zodValidator } from "./middleware/validator";

const api = new Hono()
  .use("*", dbProvider)
  .post("/rsvp", zodValidator("json", ZRsvpInsert), async (c) => {
    const db = c.var.db;
    const { child_name, adult_name, email, attending } = c.req.valid("json");

    try {
      const [rsvp] = await db
        .insert(schema.rsvps)
        .values({
          childName: child_name,
          adultName: adult_name,
          email: email.toLowerCase(),
          attending,
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
                <p style="font-size: 1.1rem; color: #555;">Hi ${adult_name},</p>
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

const app = new Hono()
  .use(
    "*",
    cors({
      origin: ["https://ophelia-birthday.com", "https://www.ophelia-birthday.com", "https://ophelia-birthday.netlify.app", "http://localhost:5173"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  )
  .get("/", (c) => {
    return c.text("Ophelia's Birthday API 🎉");
  })
  .route("/api", api);

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
