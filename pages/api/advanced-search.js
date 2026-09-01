import { requireGet } from "../../utils/api.js";
import {
  WISE_BASE_URL,
  WISE_BRANCH_ID,
  WISE_DEFAULT_PERSPECTIVE_ID,
} from "../../utils/wiseConfig.js";
import { fetchWiseResponse } from "../../utils/wiseResponse.js";

const DEFAULT_SCOPE = "anything";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

function appendParam(url, key, value) {
  if (!text(value)) return url;
  return `${url}&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function appendRepeatedParam(url, key, values) {
  return asArray(values).reduce((nextUrl, value) => appendParam(nextUrl, key, value), url);
}

function yearFacet(value) {
  const year = text(value);
  if (!/^\d{4}$/.test(year)) return "";
  return `publicationYear:${year}-01-01T00:00:00Z`;
}

function facet(field, value) {
  const clean = text(value);
  if (!field || !clean) return "";
  return `${field}:${clean}`;
}

function primarySearch(query) {
  const candidates = [
    { value: query.q, scope: "anything" },
    { value: query.title, scope: "title" },
    { value: query.author, scope: "author" },
    { value: query.subject, scope: "subject" },
    { value: query.series, scope: "series" },
    { value: query.isbn, scope: "anything" },
    { value: query.issn, scope: "anything" },
    { value: query.publisher, scope: "anything" },
    { value: query.placementCode, scope: "anything" },
    { value: query.content, scope: "anything" },
  ];

  return candidates.find((item) => text(item.value)) || { value: "", scope: DEFAULT_SCOPE };
}

export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const pageNumber = Math.max(Number(req.query.page) || 1, 1);
  const limitNumber = Math.max(Math.min(Number(req.query.limit) || 20, 50), 1);
  const offset = (pageNumber - 1) * limitNumber;
  const perspectiveId = text(req.query.perspectiveId) || WISE_DEFAULT_PERSPECTIVE_ID;
  const primary = primarySearch(req.query);

  const filters = [
    ...asArray(req.query.facetFilter).map(text).filter(Boolean),
    yearFacet(req.query.year),
    facet("genreCode", req.query.genreCode),
    facet("mediumTypeCode", req.query.mediumTypeCode),
    facet("languageCode", req.query.languageCode),
    facet("branchId", req.query.branchId),
    facet("audienceCode", req.query.audienceCode),
    facet("targetAudienceCode", req.query.targetAudienceCode),
  ].filter(Boolean);

  if (!text(primary.value) && !filters.length && req.query.available !== "true") {
    return res.status(200).json({
      query: req.query,
      response: {
        offset,
        limit: limitNumber,
        total: 0,
        items: [],
        facets: [],
        sortkeys: [],
      },
      debug: { calls: [] },
    });
  }

  let url =
    `${WISE_BASE_URL}/branch/${WISE_BRANCH_ID}/perspective/${encodeURIComponent(perspectiveId)}/search` +
    `?returnType=default` +
    `&offset=${offset}` +
    `&limit=${limitNumber}` +
    `&searchScope=${encodeURIComponent(primary.scope || DEFAULT_SCOPE)}`;

  if (text(primary.value)) url = appendParam(url, "term", primary.value);
  if (text(req.query.sort)) url = appendParam(url, "sort", req.query.sort);
  if (req.query.available === "true") url = appendParam(url, "filterAvailableTitles", "true");

  url = appendRepeatedParam(url, "facetFilter", filters);

  const call = await fetchWiseResponse(url);

  return res.status(call.ok ? 200 : call.status || 500).json({
    query: req.query,
    response: call.body,
    debug: { calls: [call] },
  });
}
