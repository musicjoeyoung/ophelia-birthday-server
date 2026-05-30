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
      origin: ["https://ophelia-birthday.netlify.app", "http://localhost:5173"],
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
