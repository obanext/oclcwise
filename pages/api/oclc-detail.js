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

/**
 * ALL detail API.
 * Returns only OCLC source responses and request evidence; no OBA contract mapping is performed.
 */
export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const { id } = req.query;

  if (!isNumericId(id)) {
    return res.status(400).json({ error: "Een numerieke titleId is verplicht" });
  }

  const calls = await Promise.all([
    fetchWiseResponse(`${WISE_BASE_URL}/discovery/title/${encodeURIComponent(id)}`),
    fetchWiseResponse(`${WISE_BASE_URL}/title/${encodeURIComponent(id)}`),
    fetchWiseResponse(
      `${WISE_BASE_URL}/branch/${encodeURIComponent(WISE_BRANCH_ID)}/titleavailability/${encodeURIComponent(
        id
      )}?clientType=PUBLIC&holdsCount=true`
    ),
    fetchWiseResponse(itemInformationUrl(id)),
    fetchWiseResponse(
      `${WISE_BASE_URL}/title/${encodeURIComponent(id)}/recommended/title?limit=5&offset=0`
    ),
  ]);

  const [
    titleCall,
    titleInfoCall,
    availabilityCall,
    itemInformationCall,
    recommendationsCall,
  ] = calls;
  if (!titleCall.ok) {
    return res.status(titleCall.status || 502).json({
      error: "OCLC kerndetail ophalen mislukt",
      debug: { calls },
    });
  }

  const warnings = [
    ["Bibliografische titelinformatie", titleInfoCall],
    ["Beschikbaarheid", availabilityCall],
    ["Exemplaren", itemInformationCall],
    ["Aanbevelingen", recommendationsCall],
  ]
    .filter(([, call]) => !call.ok)
    .map(([source, call]) => ({ source, status: call.status, error: call.error || "Call mislukt" }));

  return res.status(200).json({
    id: String(id),
    title: titleCall.body,
    titleInfo: titleInfoCall.ok ? titleInfoCall.body : null,
    availability: availabilityCall.ok ? availabilityCall.body : null,
    itemInformation: itemInformationCall.ok ? itemInformationCall.body : null,
    recommendations: recommendationsCall.ok ? recommendationsCall.body : null,
    warnings,
    debug: { calls },
  });
}
