import { debugUrl, redactDebugUrls, requireGet } from "../../utils/api.js";

const DEFAULT_NEXI_BASE_URL = "http://localhost:8000";

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

function parseJsonParam(value) {
  const raw = text(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeFirst(value) {
  const first = asArray(value).find((item) => text(item));
  return text(first);
}

function normalizeResult(item = {}) {
  return {
    ...item,
    ppn: normalizeFirst(item.ppn),
    isbn: normalizeFirst(item.isbn),
    short_title: text(item.short_title || item.title || item.titel || item.name),
    beschrijving: text(item.beschrijving),
  };
}

function normalizeResults(results) {
  return asArray(results).map(normalizeResult);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  const responseText = await response.text();
  let json = null;

  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = { raw: responseText };
  }

  return {
    url: debugUrl(url),
    status: response.status,
    ok: response.ok,
    body: json,
  };
}

function responseFromBody(body, fallbackThreadId) {
  const response = body?.response || body || {};
  const threadId = text(body?.thread_id || response?.thread_id || fallbackThreadId);
  const results = normalizeResults(response?.results);
  return { response: { ...response, results }, threadId, results };
}

export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const query = text(req.query.q);
  const incomingThreadId = text(req.query.thread_id);
  const filterDomain = text(req.query.filter_domain);
  const filterValues = parseJsonParam(req.query.filters);
  const hasFilters = Object.values(filterValues).some((value) => text(value));
  const nexiBaseUrl = text(process.env.NEXI_BASE_URL || DEFAULT_NEXI_BASE_URL).replace(/\/$/, "");

  if (!query && !hasFilters) {
    return res.status(200).json({
      query,
      thread_id: incomingThreadId || "",
      response: null,
      results: [],
      debug: { calls: [] },
    });
  }

  const calls = [];
  let threadId = incomingThreadId;

  if (!threadId) {
    const startCall = await postJson(`${nexiBaseUrl}/start_thread`, {});
    calls.push(startCall);

    if (!startCall.ok) {
      return res.status(502).json({
        error: "Nexi start_thread mislukt",
        query,
        thread_id: "",
        response: null,
        results: [],
        debug: { calls },
      });
    }

    threadId = text(startCall.body?.thread_id);
  }

  let finalBody = null;

  if (query) {
    const sendCall = await postJson(`${nexiBaseUrl}/send_message`, {
      thread_id: threadId,
      user_input: query,
    });
    calls.push(sendCall);

    if (!sendCall.ok) {
      return res.status(502).json({
        error: "Nexi send_message mislukt",
        query,
        thread_id: threadId,
        response: null,
        results: [],
        debug: { calls },
      });
    }

    finalBody = sendCall.body || {};
    threadId = responseFromBody(finalBody, threadId).threadId || threadId;
  }

  if (hasFilters && filterDomain) {
    const applyCall = await postJson(`${nexiBaseUrl}/apply_filters`, {
      thread_id: threadId,
      filter_domain: filterDomain,
      filter_values_json: filterValues,
      filter_values: "",
    });
    calls.push(applyCall);

    if (!applyCall.ok) {
      return res.status(502).json({
        error: "Nexi apply_filters mislukt",
        query,
        thread_id: threadId,
        response: null,
        results: [],
        debug: { calls },
      });
    }

    finalBody = applyCall.body || {};
    threadId = responseFromBody(finalBody, threadId).threadId || threadId;
  }

  const normalized = responseFromBody(finalBody || {}, threadId);

  return res.status(200).json({
    query,
    thread_id: normalized.threadId,
    response: normalized.response,
    results: normalized.results,
    debug: {
      calls,
      nexiDebug: redactDebugUrls(finalBody?.debug || null),
    },
  });
}
