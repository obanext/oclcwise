import { generateWiseKey, getFallbackWiseKey } from "./wiseKey.js";

const AUTHENTICATION_STATUSES = new Set([401, 403]);

function createWiseHeaders(wiseKey, sourceHeaders) {
  const headers = new Headers(sourceHeaders || {});
  const application = process.env.APPLICATION?.trim();

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (application && !headers.has("application")) {
    headers.set("application", application);
  }

  headers.set("wise_key", wiseKey);
  return headers;
}

async function fetchWithKey(url, options, wiseKey) {
  return fetch(url, {
    ...options,
    headers: createWiseHeaders(wiseKey, options.headers),
  });
}

/**
 * Fetch an OCLC Wise endpoint with a generated daily key.
 *
 * Fallback behavior:
 * - If local key generation fails, use WISE_KEY directly when configured.
 * - If Wise rejects the generated key with 401/403, retry once with WISE_KEY.
 */
export async function wiseFetch(url, options = {}) {
  let generatedKey;

  try {
    generatedKey = generateWiseKey();
  } catch (error) {
    const fallbackKey = getFallbackWiseKey();

    if (!fallbackKey) {
      throw error;
    }

    console.warn(
      `Dynamische Wise-key kon niet worden gegenereerd; WISE_KEY fallback wordt gebruikt: ${error.message}`
    );

    return fetchWithKey(url, options, fallbackKey);
  }

  const response = await fetchWithKey(url, options, generatedKey);

  if (!AUTHENTICATION_STATUSES.has(response.status)) {
    return response;
  }

  const fallbackKey = getFallbackWiseKey();

  if (!fallbackKey || fallbackKey === generatedKey) {
    return response;
  }

  console.warn(
    `Wise wees de gegenereerde sleutel af met status ${response.status}; WISE_KEY fallback wordt eenmaal geprobeerd`
  );

  try {
    await response.body?.cancel();
  } catch {
    // The rejected response is intentionally discarded before the retry.
  }

  return fetchWithKey(url, options, fallbackKey);
}
