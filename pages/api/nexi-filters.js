import { requireGet } from "../../utils/api.js";

const DEFAULT_NEXI_BASE_URL = "http://localhost:8000";

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const domain = text(req.query.domain);
  const nexiBaseUrl = text(process.env.NEXI_BASE_URL || DEFAULT_NEXI_BASE_URL).replace(/\/$/, "");

  if (!domain) {
    return res.status(400).json({ error: "Domein ontbreekt", domain: "", groups: [] });
  }

  try {
    const response = await fetch(`${nexiBaseUrl}/filters/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/json" },
    });
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(502).json({ error: "Nexi filters mislukt", domain, groups: [], debug: { status: response.status, body: json } });
    }

    return res.status(200).json(json || { domain, groups: [] });
  } catch (error) {
    return res.status(502).json({ error: error.message || "Nexi filters mislukt", domain, groups: [] });
  }
}
