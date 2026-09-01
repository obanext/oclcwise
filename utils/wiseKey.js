import { createHmac } from "node:crypto";

const MILLISECONDS_PER_DAY = 86_400_000;

function readEnvironmentVariable(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} ontbreekt in de environment variables`);
  }

  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`${name} mag geen regeleinde bevatten`);
  }

  return value;
}

/**
 * Generate the daily OCLC Wise key from the server-side credentials.
 * The epoch day changes at 00:00 UTC.
 */
export function generateWiseKey(now = Date.now()) {
  const apiKeyId = readEnvironmentVariable("WISE_API_KEY_ID");
  const apiKey = readEnvironmentVariable("WISE_API_KEY");
  const application = readEnvironmentVariable("APPLICATION");

  const timestamp = now instanceof Date ? now.getTime() : Number(now);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Ongeldige datum voor Wise-keygeneratie");
  }

  const epochDay = Math.floor(timestamp / MILLISECONDS_PER_DAY);
  const payload = `${epochDay}${application}`;
  const signature = createHmac("sha256", apiKey)
    .update(payload, "utf8")
    .digest("hex");

  return `${apiKeyId}:${signature}`;
}

/** Return the static Vercel key when it is configured. */
export function getFallbackWiseKey() {
  const fallbackKey = process.env.WISE_KEY?.trim() || "";

  if (fallbackKey.includes("\n") || fallbackKey.includes("\r")) {
    throw new Error("WISE_KEY mag geen regeleinde bevatten");
  }

  return fallbackKey;
}
