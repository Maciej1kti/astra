import { readFile, writeFile, mkdir } from "node:fs/promises";
import { compile } from "json-schema-to-typescript";

const root = new URL("../", import.meta.url);
const schema = JSON.parse(
  await readFile(new URL("contracts/domain.schema.json", root), "utf8"),
);
const output = new URL("apps/web/src/lib/domain.generated.ts", root);
const text = await compile(schema, "DomainContract", {
  bannerComment:
    "/* Generated from contracts/domain.schema.json. Run npm run contracts. Types do not replace server validation. */",
  unreachableDefinitions: true,
});
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8").catch(() => "")) !== text) {
    throw new Error("Domain types are stale. Run npm run contracts.");
  }
} else {
  await mkdir(new URL("apps/web/src/lib/", root), { recursive: true });
  await writeFile(output, text);
}

// API response shapes come from OpenAPI, including their domain references.
const openapi = JSON.parse(
  await readFile(new URL("contracts/openapi.generated.json", root), "utf8"),
);
const names = [
  "Bootstrap",
  "Summary",
  "CommandResponse",
  "CommandStatus",
  "Accepted",
  "TagSuggestions",
  "Error",
];
const apiSchema = {
  type: "object",
  additionalProperties: false,
  required: names,
  properties: Object.fromEntries(
    names.map((name) => [name, { $ref: `#/components/schemas/${name}` }]),
  ),
  components: openapi.components,
};
// Retained handoff prose is not duplicated into the new generated type surface.
function typeOnly(value) {
  if (Array.isArray(value)) return value.map(typeOnly);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "description")
        .map(([key, value]) => [key, typeOnly(value)]),
    );
  return value;
}
const apiText = await compile(typeOnly(apiSchema), "ApiContracts", {
  bannerComment:
    "/* Generated from contracts/openapi.generated.json. Run npm run contracts. */",
  maxItems: 0,
});
const apiOutput = new URL("apps/web/src/lib/api.generated.ts", root);
if (process.argv.includes("--check")) {
  if ((await readFile(apiOutput, "utf8").catch(() => "")) !== apiText)
    throw new Error("API types are stale. Run npm run contracts.");
} else await writeFile(apiOutput, apiText);
