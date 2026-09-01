export function requireGet(req, res) {
  if (req.method === "GET") return true;

  res.setHeader("Allow", "GET");
  res.status(405).json({ error: "Alleen GET is toegestaan" });
  return false;
}

export function debugUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.pathname}${url.search}`;
  } catch {
    const raw = String(value || "");
    return raw.replace(/^https?:\/\/[^/]+/i, "");
  }
}

export function redactDebugUrls(value) {
  if (Array.isArray(value)) return value.map(redactDebugUrls);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDebugUrls(item)])
    );
  }

  if (typeof value === "string") {
    return value.replace(/https?:\/\/[^/\s"']+/gi, "");
  }

  return value;
}
