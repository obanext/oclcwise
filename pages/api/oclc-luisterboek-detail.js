import { requireGet } from "../../utils/api.js";
import { WISE_BASE_URL, WISE_BRANCH_ID } from "../../utils/wiseConfig.js";
import { fetchWiseResponse } from "../../utils/wiseResponse.js";

const isPpn = (value) => /^\d+$/.test(String(value || "").trim());

export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const ppn = String(req.query.ppn || "").trim().replace(/^PPN:/i, "");

  if (!isPpn(ppn)) {
    return res.status(400).json({ error: "Een numeriek PPN is verplicht" });
  }

  const endpoint = `/discovery/origin/nbcplus/branch/${encodeURIComponent(WISE_BRANCH_ID)}/title/${encodeURIComponent(ppn)}`;
  const detailCall = await fetchWiseResponse(`${WISE_BASE_URL}${endpoint}`);

  if (!detailCall.ok) {
    return res.status(detailCall.status || 502).json({
      error: "NBC+-luisterboekdetail ophalen mislukt",
      debug: { calls: [detailCall] },
    });
  }

  return res.status(200).json({
    id: `PPN:${ppn}`,
    ppn,
    origin: "NBC_PLUS",
    endpoint,
    title: detailCall.body,
    debug: { calls: [detailCall] },
  });
}
