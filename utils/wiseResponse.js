import { debugUrl } from "./api.js";
import { WISE_TIMEOUT_MS } from "./wiseConfig.js";
import { wiseFetch } from "./wiseFetch.js";

function timeoutError(timeoutMs) {
  return `WISE-call afgebroken na ${Math.round(timeoutMs / 1000)} seconden`;
}

export async function fetchWiseResponse(url, options = {}) {
  const { timeoutMs: requestedTimeoutMs, ...fetchOptions } = options;
  const timeoutMs = Number(requestedTimeoutMs) || WISE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await wiseFetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    const bodyText = await response.text();

    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText || null;
    }

    return {
      url: debugUrl(url),
      status: response.status,
      ok: response.ok,
      body,
    };
  } catch (error) {
    const timedOut = error?.name === "AbortError";

    return {
      url: debugUrl(url),
      status: timedOut ? 504 : 502,
      ok: false,
      body: null,
      timedOut,
      error: timedOut ? timeoutError(timeoutMs) : error?.message || "WISE-call mislukt",
    };
  } finally {
    clearTimeout(timer);
  }
}
