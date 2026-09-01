import { mapWiseToObaFull } from "../../mapping/mapWiseToObaFull.js";
import { requireGet } from "../../utils/api.js";
import {
  WISE_BASE_URL,
  WISE_BRANCH_ID,
  WISE_ITEM_INFORMATION_PARAMS,
} from "../../utils/wiseConfig.js";
import { fetchWiseResponse } from "../../utils/wiseResponse.js";

const isNumericId = (value) => /^\d+$/.test(String(value || ""));

function itemInformationUrl(id) {
  const params = new URLSearchParams(WISE_ITEM_INFORMATION_PARAMS);
  return `${WISE_BASE_URL}/title/${encodeURIComponent(id)}/iteminformation?${params.toString()}`;
}

// IST detail API.
// Purpose: fetch the four OCLC detail sources and map them to the current OBA detail JSON contract.
export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const { id } = req.query;

  if (!isNumericId(id)) {
    return res.status(400).json({ error: "Een numerieke titleId is verplicht" });
  }

  // These four calls are the detail evidence set used by the visual page, mapped output and CSV.
  const [title, titleInfo, availability, items] = await Promise.all([
    fetchWiseResponse(`${WISE_BASE_URL}/discovery/title/${encodeURIComponent(id)}`),
    fetchWiseResponse(`${WISE_BASE_URL}/title/${encodeURIComponent(id)}`),
    fetchWiseResponse(
      `${WISE_BASE_URL}/branch/${encodeURIComponent(WISE_BRANCH_ID)}` +
        `/titleavailability/${encodeURIComponent(id)}?clientType=PUBLIC&holdsCount=true`
    ),
    fetchWiseResponse(itemInformationUrl(id)),
  ]);

  const calls = [title, titleInfo, availability, items];

  if (!title.ok) {
    return res.status(title.status || 502).json({
      error: "OCLC kerndetail ophalen mislukt",
      debug: { calls },
    });
  }

  const warnings = [
    ["Bibliografische titelinformatie", titleInfo],
    ["Beschikbaarheid", availability],
    ["Exemplaren", items],
  ]
    .filter(([, call]) => !call.ok)
    .map(([source, call]) => ({ source, status: call.status, error: call.error || "Call mislukt" }));

  const raw = {
    title: title.body,
    titleInfo: titleInfo.ok ? titleInfo.body : null,
    availability: availability.ok ? availability.body : null,
    itemInformation: items.ok ? items.body : null,
    debug: { calls },
  };

  const mapped = mapWiseToObaFull(raw);

  res.status(200).json({ raw, mapped, warnings });
}
