import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../../protocol/schemas/envelope.json');

type Envelope = Record<string, unknown>;
type Schema = {
  required?: string[];
  properties?: Record<string, { type?: string }>;
};

const schema: Schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

export function validateEnvelope(input: unknown): { ok: true } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'envelope_not_object' };
  const env = input as Envelope;

  for (const req of schema.required || []) {
    if (env[req] === undefined || env[req] === null) {
      return { ok: false, error: `missing_${req}` };
    }
  }

  for (const [key, def] of Object.entries(schema.properties || {})) {
    if (env[key] === undefined || env[key] === null || !def.type) continue;
    if (def.type === 'integer' && !Number.isInteger(env[key])) return { ok: false, error: `invalid_${key}` };
    if (def.type === 'string' && typeof env[key] !== 'string') return { ok: false, error: `invalid_${key}` };
    if (def.type === 'object' && (typeof env[key] !== 'object' || Array.isArray(env[key]))) return { ok: false, error: `invalid_${key}` };
  }

  return { ok: true };
}
