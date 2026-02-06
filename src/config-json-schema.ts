/**
 * OpenClaw Chat config JSON Schema for Clawdbot plugin validation.
 * This avoids Zod instance compatibility issues between plugin and host.
 */

const openclawChatAccountJsonSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const },
    enabled: { type: "boolean" as const },
    host: { type: "string" as const },
    port: { type: "number" as const },
    path: { type: "string" as const },
    authToken: { type: "string" as const },
    dmPolicy: {
      type: "string" as const,
      enum: ["pairing", "allowlist", "open", "disabled"],
    },
    allowFrom: {
      type: "array" as const,
      items: { oneOf: [{ type: "string" as const }, { type: "number" as const }] },
    },
    mediaMaxMb: { type: "number" as const },
  },
  additionalProperties: true,
};

export const OpenclawChatConfigJsonSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  type: "object" as const,
  properties: {
    ...openclawChatAccountJsonSchema.properties,
    accounts: {
      type: "object" as const,
      additionalProperties: openclawChatAccountJsonSchema,
    },
    defaultAccount: { type: "string" as const },
  },
  additionalProperties: true,
};
