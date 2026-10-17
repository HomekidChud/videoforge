// Generates client/public/openapi.json from the endpoint list and the operation catalog.
// The schemas are descriptive: operation arguments are documented as prose in each op's
// description, exactly as GET /api/capabilities reports them. Run with: npm run docs
import { mkdir, writeFile } from "node:fs/promises";
import { capabilities } from "../shared/capabilities";
import { DOC_ENDPOINTS } from "./generate-docs";

const HOSTED = "https://videoforge-api-s54w.onrender.com";

/** OpenAPI paths use {param}; the endpoint table uses :param. */
const toOpenApiPath = (p: string) => p.replace(/:(\w+)/g, "{$1}");
const pathParams = (p: string) => [...p.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: "path" as const, required: true, schema: { type: "string" }, description: `The ${m[1]} of the resource.` }));
const tagOf = (route: string) => route.replace(/^\/api\//, "").split("/")[0].replace(/s$/, "") || "general";

const authResponses = {
  "401": { description: "Missing or invalid credentials." },
  "403": { description: "The key's scope or restrictions deny this route." },
};

export async function generateOpenAPI(): Promise<void> {
  const caps = capabilities();
  const opList = Object.entries(caps.ops as Record<string, string>);
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [methods, route, purpose] of DOC_ENDPOINTS) {
    const entry = paths[toOpenApiPath(route)] ?? {};
    for (const method of methods.split(",")) {
      const m = method.toLowerCase();
      const spec: Record<string, unknown> = {
        summary: purpose,
        tags: [tagOf(route)],
        responses: {
          "200": { description: "OK. Error bodies include a message; invalid ops return 422 with failedIndex, stale guarded writes return 409, unknown resources return 404." },
          ...authResponses,
        },
      };
      if (route.includes(":")) spec.parameters = pathParams(route);
      if (m === "post") {
        spec.requestBody = {
          description: "The request body depends on the route; see the page for the route in the HTTP API reference. Timeline batch operations are documented by name below.",
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
              examples: route.includes("timeline/ops") ? { batch: { value: { ops: [{ op: "update_clip", args: { clipId: "clip-1", speed: 1.5 } }], dryRun: true } } } : undefined,
            },
          },
        };
      }
      entry[m] = spec;
    }
    paths[toOpenApiPath(route)] = entry;
  }

  const doc = {
    openapi: "3.1.0",
    info: {
      title: "VideoForge API",
      version: String(caps.version),
      description: [
        "Self-hosted video editing, asset-free motion graphics and FFmpeg rendering. The browser Studio and agent API drive the same timeline; no agent-supplied code is executed.",
        "",
        "Timeline batch operations (POST /api/projects/{id}/timeline/ops, body {op,args} or {ops:[...]}), documented as GET /api/capabilities reports them:",
        ...opList.map(([name, args]) => `- ${name}: ${args}`),
      ].join("\n"),
      "x-notice": "Argument schemas are descriptive prose from the operation catalog, not JSON Schema. GET /api/capabilities on your deployment is the live source of truth.",
    },
    servers: [
      { url: HOSTED, description: "Hosted deployment (for trying the API; per-deployment keys)" },
      { url: "http://localhost:3000", description: "Your own server (self-hosting)" },
    ],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Scoped API key issued by this deployment. Read, write or admin scope." } } },
    paths,
  };

  await mkdir("client/public", { recursive: true });
  await writeFile("client/public/openapi.json", `${JSON.stringify(doc, null, 2)}\n`, "utf-8");
}

if (process.argv[1] && process.argv[1].endsWith("generate-openapi.ts")) {
  await generateOpenAPI();
  console.log("openapi.json written to client/public");
}
