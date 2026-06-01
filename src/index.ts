import * as schema from "./db/schema";

import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";
import { eq, inArray, sql } from "drizzle-orm";

import { HTTPException } from "hono/http-exception";
import { Hono } from "hono";
import { ZRsvpInsert } from "./dtos";
import { cors } from "hono/cors";
import { dbProvider } from "./middleware/dbProvider";
import { zodValidator } from "./middleware/validator";

function formatNames(raw: string): string {
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, & ${parts[parts.length - 1]}`;
}

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

      const greeting = adult_name
        ? adult_name_2 ? `${adult_name} & ${adult_name_2}` : adult_name
        : child_name;

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
                <p style="font-size: 1.1rem; color: #555;">Hi ${greeting},</p>
                <p style="color: #555;">We're so excited to celebrate Ophelia's 5th birthday with you${child_name_2 ? `, ${child_name}, & ${child_name_2}` : ` and ${child_name}`}!</p>
                <div style="background: #ecc8d0; border-radius: 12px; padding: 1rem 1.25rem; margin: 1.5rem 0; color: #333;">
                <table style="border-collapse: collapse; width: 100%;">
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em; padding-bottom: 0.4em;"><strong>🎂 What:</strong></td><td style="vertical-align: top; padding-bottom: 0.4em;">Ophelia's 5th Birthday Party!</td></tr>
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em; padding-bottom: 0.4em;"><strong>📍 Where:</strong></td><td style="vertical-align: top; padding-bottom: 0.4em;"><a href="https://maps.app.goo.gl/pDRcBvAxjHp5tsjV9">Little Pulp, 80-16 Cooper Avenue, Glendale, NY 11385</a></td></tr>
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em; padding-bottom: 0.4em;"><strong>🕚 When:</strong></td><td style="vertical-align: top;">Sunday, July 12th, 11:00am – 1:00pm</td></tr>
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em;"><strong>🌐 More:</strong></td><td style="vertical-align: top;">Please check the <a href="https://ophelia-birthday.com" style="color: #c13b6c;">website</a> for more party details.</td></tr>
                </table>
                </div>
                <p style="color: #555;">Can't wait to see you there!</p>
                <p style="color: #c13b6c; font-weight: bold;">With love, Ophelia's family 💕</p>
                <p style="margin-top: 1.5rem; font-size: 0.8rem; color: #aaa;">Need to make a change? <a href="https://ophelia-birthday.com/?update=true" style="color: #c13b6c;">Update your RSVP</a></p>
              </div>
            `,
          }),
        });
      } else {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Ophelia's Birthday <rsvp@ophelia-birthday.com>",
            to: email,
            subject: "We'll miss you! 💕",
            html: `
              <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #c13b6c;">
                <p style="font-size: 1.1rem; color: #555;">Hi ${greeting},</p>
                <p style="color: #555;">Thanks for letting us know that you can't make it. We'll miss you and hope to see you again soon!</p>
                <p style="color: #c13b6c; font-weight: bold;">— Joe &amp; Carly</p>
                <p style="color: #555;">Please check the <a href="https://ophelia-birthday.com" style="color: #c13b6c;">website</a> for more party details.</p>
                <p style="margin-top: 1.5rem; font-size: 0.8rem; color: #aaa;">Need to make a change? <a href="https://ophelia-birthday.com/?update=true" style="color: #c13b6c;">Update your RSVP</a></p>
              </div>
            `,
          }),
        });
      }

      // Admin notification
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ophelia's Birthday <rsvp@ophelia-birthday.com>",
          to: "musicjoeyoung@gmail.com",
          subject: `New RSVP: ${attending ? '✅ YES' : '❌ NO'} — ${child_name}${child_name_2 ? ` & ${child_name_2}` : ''}`,
          html: `
            <div style="font-family: sans-serif; color: #333;">
              <p><strong>Status:</strong> ${attending ? '✅ Attending' : '❌ Not attending'}</p>
              <p><strong>Child:</strong> ${child_name}${child_name_2 ? `, ${child_name_2}` : ''}</p>
              ${adult_name ? `<p><strong>Adult:</strong> ${adult_name}${adult_name_2 ? `, ${adult_name_2}` : ''}</p>` : ''}
              <p><strong>Email:</strong> ${email}</p>
              ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
            </div>
          `,
        }),
      });

      return c.json({ success: true, id: rsvp.id }, 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return c.json({ message: "You've already RSVP'd with that email!", code: "duplicate" }, 409);
      }
      throw err;
    }
  })
  .put("/rsvp", zodValidator("json", ZRsvpInsert), async (c) => {
    const db = c.var.db;
    const { child_name, child_name_2, adult_name, adult_name_2, email, attending, message } = c.req.valid("json");

    const [rsvp] = await db
      .update(schema.rsvps)
      .set({
        childName: child_name,
        childName2: child_name_2 ?? null,
        adultName: adult_name ?? '',
        adultName2: adult_name_2 ?? null,
        attending,
        message: message ?? null,
      })
      .where(sql`lower(${schema.rsvps.email}) = ${email.toLowerCase()}`)
      .returning();

    if (!rsvp) {
      return c.json({ message: "No RSVP found for that email." }, 404);
    }

    const greeting = adult_name
      ? adult_name_2 ? `${adult_name} & ${adult_name_2}` : adult_name
      : child_name;

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
          subject: "Your RSVP has been updated! 🎉",
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #c13b6c;">
              <h1 style="font-size: 1.8rem; margin-bottom: 0.5rem;">You're coming! 🌈</h1>
              <p style="font-size: 1.1rem; color: #555;">Hi ${greeting},</p>
                <p style="color: #555;">We're so excited to celebrate Ophelia's 5th birthday with you${child_name_2 ? `, ${child_name}, & ${child_name_2}` : ` and ${child_name}`}!</p>
              <div style="background: #ecc8d0; border-radius: 12px; padding: 1rem 1.25rem; margin: 1.5rem 0; color: #333;">
                <table style="border-collapse: collapse; width: 100%;">
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em; padding-bottom: 0.4em;"><strong>🎂 What:</strong></td><td style="vertical-align: top; padding-bottom: 0.4em;">Ophelia's 5th Birthday Party!</td></tr>
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em; padding-bottom: 0.4em;"><strong>📍 Where:</strong></td><td style="vertical-align: top; padding-bottom: 0.4em;"><a href="https://maps.app.goo.gl/pDRcBvAxjHp5tsjV9">Little Pulp, 80-16 Cooper Avenue, Glendale, NY 11385</a></td></tr>
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em; padding-bottom: 0.4em;"><strong>🕚 When:</strong></td><td style="vertical-align: top;">Sunday, July 12th, 11:00am – 1:00pm</td></tr>
                  <tr><td style="white-space: nowrap; vertical-align: top; padding-right: 0.5em;"><strong>🌐 More:</strong></td><td style="vertical-align: top;">Please check the <a href="https://ophelia-birthday.com" style="color: #c13b6c;">website</a> for more party details.</td></tr>
                </table>
              </div>
              <p style="color: #555;">Can't wait to see you there!</p>
              <p style="color: #c13b6c; font-weight: bold;">With love, Ophelia's family 💕</p>
              <p style="margin-top: 1.5rem; font-size: 0.8rem; color: #aaa;">Need to make a change? <a href="https://ophelia-birthday.com/?update=true" style="color: #c13b6c;">Update your RSVP</a></p>
            </div>
          `,
        }),
      });
    } else {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ophelia's Birthday <rsvp@ophelia-birthday.com>",
          to: email,
          subject: "Your RSVP has been updated 💕",
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #c13b6c;">
              <p style="font-size: 1.1rem; color: #555;">Hi ${greeting},</p>
              <p style="color: #555;">We've updated your RSVP. Thanks for letting us know — we'll miss you and hope to see you again soon!</p>
              <p style="color: #c13b6c; font-weight: bold;">— Joe &amp; Carly</p>
              <p style="margin-top: 1.5rem; font-size: 0.8rem; color: #aaa;">Need to make a change? <a href="https://ophelia-birthday.com/?update=true" style="color: #c13b6c;">Update your RSVP</a></p>
            </div>
          `,
        }),
      });
    }

    // Admin notification
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ophelia's Birthday <rsvp@ophelia-birthday.com>",
        to: "musicjoeyoung@gmail.com",
        subject: `Updated RSVP: ${attending ? '✅ YES' : '❌ NO'} — ${child_name}${child_name_2 ? ` & ${child_name_2}` : ''}`,
        html: `
          <div style="font-family: sans-serif; color: #333;">
            <p><strong>Status:</strong> ${attending ? '✅ Attending' : '❌ Not attending'} (updated)</p>
            <p><strong>Child:</strong> ${child_name}${child_name_2 ? `, ${child_name_2}` : ''}</p>
            ${adult_name ? `<p><strong>Adult:</strong> ${adult_name}${adult_name_2 ? `, ${adult_name_2}` : ''}</p>` : ''}
            <p><strong>Email:</strong> ${email}</p>
            ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
          </div>
        `,
      }),
    });

    return c.json({ success: true, id: rsvp.id }, 200);
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
  .get("/invitees", async (c) => {
    const db = c.var.db;
    const rows = await db.select().from(schema.invitees).orderBy(schema.invitees.createdAt);
    return c.json(rows);
  })
  .post("/invitees", async (c) => {
    const db = c.var.db;
    const { name, email, notes } = await c.req.json<{ name?: string; email?: string; notes?: string }>();
    if (!name?.trim()) return c.json({ message: "name is required" }, 400);
    const [invitee] = await db
      .insert(schema.invitees)
      .values({ name: name.trim(), email: email?.trim() || null, notes: notes?.trim() || null })
      .returning();
    return c.json(invitee, 201);
  })
  .delete("/invitees/:id", async (c) => {
    const db = c.var.db;
    const id = Number(c.req.param("id"));
    await db.delete(schema.invitees).where(eq(schema.invitees.id, id));
    return c.json({ success: true });
  })
  .patch("/invitees/:id", async (c) => {
    const db = c.var.db;
    const id = Number(c.req.param("id"));
    const { name, email, notes } = await c.req.json<{ name?: string; email?: string | null; notes?: string | null }>();
    const [updated] = await db
      .update(schema.invitees)
      .set({
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      })
      .where(eq(schema.invitees.id, id))
      .returning();
    if (!updated) return c.json({ message: "Not found" }, 404);
    return c.json(updated);
  })
  .post("/send-invite", async (c) => {
    const db = c.var.db;
    const { ids, extra_text } = await c.req.json<{ ids: number[]; extra_text?: string }>();
    if (!ids?.length) return c.json({ message: "ids are required" }, 400);

    const toSend = await db.select().from(schema.invitees).where(inArray(schema.invitees.id, ids));
    const withEmail = toSend.filter((i) => i.email);

    const results: { name: string; email: string; ok: boolean }[] = [];
    for (const invitee of withEmail) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ophelia's Birthday <rsvp@ophelia-birthday.com>",
          to: invitee.email,
          subject: `${formatNames(invitee.name)}: You're invited to Ophelia's 5th Birthday Party! 🎉`,
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; text-align: center; color: #333;">
              <p style="font-family: 'Comic Sans MS', 'Nunito', sans-serif; font-size: 1.1rem; color: #555; text-align: center; margin-bottom: 0.75rem;">${formatNames(invitee.name)}: You're invited to Ophelia's 5th Birthday Party! 🎉</p>
              ${extra_text ? `<p style="color: #555; text-align: left; margin-bottom: 1rem; white-space: pre-line;">${extra_text}</p>` : ""}
              <img src="https://ophelia-birthday.com/flyer.jpg?v=2" alt="Ophelia's 5th Birthday Party Invitation" style="width: 100%; max-width: 520px; border-radius: 8px;" />
              <p style="margin-top: 1.5rem;">
                <a href="https://ophelia-birthday.com" style="background: #c13b6c; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 1rem; display: inline-block;">RSVP</a>
              </p>
            </div>
          `,
        }),
      });
      results.push({ name: invitee.name, email: invitee.email!, ok: res.ok });
    }

    const failed = results.filter((r) => !r.ok).map((r) => r.email);
    return c.json({ sent: results.length - failed.length, failed, skipped: toSend.length - withEmail.length });
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
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
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
