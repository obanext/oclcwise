import { mapWiseSearchToObaFull } from "../../mapping/mapWiseSearchToObaFull.js";
import { requireGet } from "../../utils/api.js";
import {
  WISE_BASE_URL,
  WISE_BRANCH_ID,
  WISE_CLIENT_TYPE,
  WISE_DEFAULT_PERSPECTIVE_ID,
  WISE_DEFAULT_SCOPE,
  WISE_DEFAULT_SORT,
} from "../../utils/wiseConfig.js";
import {
  extractPerspectives,
  resolveSearchConfiguration,
} from "../../utils/wisePerspective.js";
import { fetchWiseResponse } from "../../utils/wiseResponse.js";
import { fetchWiseSuggestions } from "../../utils/wiseSuggestions.js";

// Normalize fields that may be returned by OCLC as either a single value or an array.
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// Convert optional request/API values to safe strings.
const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

// Validate ids before they are used as detail-page ids.
function isNumericId(value) {
  return /^\d+$/.test(text(value));
}

// Read result items from the OCLC titlesummary response.
// Multiple names are kept because WISE/OCLC responses can differ by endpoint/configuration.
function extractSearchItems(body) {
  if (!body || typeof body !== "object") return [];

  return asArray(
    body.titles ||
      body.title ||
      body.items ||
      body.results ||
      body.result ||
      body.content ||
      body.documents ||
      body.titleSummaries ||
      body.summaries ||
      []
  );
}

// Resolve the numeric title id used by the mockup detail page.
// The titlesummary result often carries it in childTitleList[0].childTitleId.
function extractChildTitleId(item) {
  const id =
    item?.childTitleList?.[0]?.childTitleId ||
    item?.title?.childTitleList?.[0]?.childTitleId ||
    item?.childTitleId ||
    item?.title?.childTitleId ||
    "";

  return isNumericId(id) ? text(id) : "";
}

// Keep the OCLC/FRBR source id for evidence/debug and mapped metadata.
function extractSourceId(item) {
  return text(item?.id || item?.title?.id || item?.frbrkey || item?.title?.frbrkey || "");
}

// Read the total result count from the titlesummary response.
function extractTotal(body, fallback) {
  if (!body || typeof body !== "object") return fallback;

  return (
    body.total ||
    body.totalElements ||
    body.count ||
    body.numFound ||
    body.totalResults ||
    body.numberOfResults ||
    body.resultCount ||
    fallback
  );
}

// Append a query parameter without changing existing endpoint parameters.
function appendParam(url, key, value) {
  if (value === undefined || value === null || value === "") return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

// Append repeated query parameters such as facetFilter.
function appendRepeatedParam(url, key, values) {
  return asArray(values).reduce((nextUrl, value) => appendParam(nextUrl, key, value), url);
}

// Merge the search summary with the matching discovery-title response.
// Search-specific fields remain available when the detail response omits them.
function mergeTitleData(summary = {}, discovery = {}) {
  const hasArrayValues = (value) => Array.isArray(value) && value.length > 0;

  return {
    ...discovery,
    ...summary,
    imageUrls: { ...(discovery.imageUrls || {}), ...(summary.imageUrls || {}) },
    author: summary.author || discovery.author,
    media: summary.media || discovery.media,
    language: hasArrayValues(summary.language) ? summary.language : discovery.language,
    isbn: hasArrayValues(summary.isbn) ? summary.isbn : discovery.isbn,
    ppn: hasArrayValues(discovery.ppn) ? discovery.ppn : summary.ppn,
    genre: hasArrayValues(summary.genre) ? summary.genre : discovery.genre,
    subjects: hasArrayValues(discovery.subjects) ? discovery.subjects : summary.subjects,
    collaborators: hasArrayValues(discovery.collaborators)
      ? discovery.collaborators
      : summary.collaborators,
    childTitleList: hasArrayValues(summary.childTitleList)
      ? summary.childTitleList
      : discovery.childTitleList,
    titleSeries: hasArrayValues(discovery.titleSeries)
      ? discovery.titleSeries
      : summary.titleSeries,
  };
}

// Convert one OCLC titlesummary item and its discovery-title response
// to the source shape consumed by the search mapper.
function normalizeSearchItem(item, discoveryTitle = {}) {
  const detailId = extractChildTitleId(item);

  if (!detailId) return null;

  return {
    id: detailId,
    sourceId: extractSourceId(item),
    resolvedDetailId: detailId,
    titleSummary: item,
    discoveryTitle,
    title: {
      ...mergeTitleData(item, discoveryTitle),
      id: detailId,
    },
  };
}

// IST search API.
// Purpose: fetch perspective, titlesummary and discovery-title evidence, then produce mapped OBA JSON-contract output.
export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const {
    q = "",
    page = "1",
    limit = "20",
    suggest = "",
    perspectiveId = WISE_DEFAULT_PERSPECTIVE_ID,
    searchScope = WISE_DEFAULT_SCOPE,
    sort = WISE_DEFAULT_SORT,
    facetFilter = [],
    filterAvailableTitles = "false",
  } = req.query;

  const query = String(q || "").trim();

  if (suggest === "1") {
    const suggestionResult = await fetchWiseSuggestions(query, searchScope);
    return res.status(suggestionResult.ok ? 200 : suggestionResult.status || 502).json({
      suggestions: suggestionResult.suggestions,
      error: suggestionResult.error || undefined,
      debug: { calls: suggestionResult.call ? [suggestionResult.call] : [] },
    });
  }

  const pageNumber = Math.max(Number(page) || 1, 1);
  // IST enriches every visible result with a discovery call, so its API limit stays at 50.
  const limitNumber = Math.max(Math.min(Number(limit) || 20, 50), 1);
  const offset = (pageNumber - 1) * limitNumber;

  const perspectiveUrl =
    `${WISE_BASE_URL}/branch/${encodeURIComponent(WISE_BRANCH_ID)}` +
    `/clienttype/${encodeURIComponent(WISE_CLIENT_TYPE)}/perspective`;
  const perspectiveCall = await fetchWiseResponse(perspectiveUrl);

  if (!perspectiveCall.ok) {
    return res.status(perspectiveCall.status || 502).json({
      error: "Perspectives ophalen mislukt",
      debug: { calls: [perspectiveCall] },
    });
  }

  const perspectives = extractPerspectives(perspectiveCall.body);
  const scopeWasProvided = Object.prototype.hasOwnProperty.call(req.query, "searchScope");
  const sortWasProvided = Object.prototype.hasOwnProperty.call(req.query, "sort");
  const configuration = resolveSearchConfiguration({
    perspectives,
    requestedPerspectiveId: perspectiveId,
    requestedScope: searchScope,
    requestedSort: sort,
    scopeWasProvided,
    sortWasProvided,
  });

  if (configuration.error) {
    return res.status(400).json({
      error: configuration.error,
      debug: { calls: [perspectiveCall] },
    });
  }

  const { selectedPerspectiveId, selectedScope, selectedSort } = configuration;

  if (!query) {
    const raw = {
      query,
      page: pageNumber,
      limit: limitNumber,
      total: 0,
      ids: [],
      titles: [],
      suggestions: [],
      perspectives,
      selectedPerspectiveId,
      selectedSearchScope: selectedScope,
      selectedSort,
      selectedFacetFilters: asArray(facetFilter),
      searchResponse: {},
      resolvedItems: [],
      debug: {
        calls: [perspectiveCall],
      },
    };

    const mapped = mapWiseSearchToObaFull(raw);
    return res.status(200).json({ raw, mapped });
  }

  let titleSummaryUrl =
    `${WISE_BASE_URL}/branch/${WISE_BRANCH_ID}/perspective/${encodeURIComponent(
      selectedPerspectiveId
    )}/titlesummary` +
    `?returnType=default` +
    `&term=${encodeURIComponent(query)}` +
    `&offset=${offset}` +
    `&limit=${limitNumber}` +
    `&searchScope=${encodeURIComponent(selectedScope)}` +
    `&sort=${encodeURIComponent(selectedSort)}` +
    `&filterAvailableTitles=${encodeURIComponent(filterAvailableTitles)}` +
    `&enableMultiSelectFaceting=true`;

  titleSummaryUrl = appendRepeatedParam(titleSummaryUrl, "facetFilter", facetFilter);

  const searchCall = await fetchWiseResponse(titleSummaryUrl);

  if (!searchCall.ok) {
    return res.status(searchCall.status || 502).json({
      error: "Zoekopdracht ophalen mislukt",
      debug: { calls: [perspectiveCall, searchCall] },
    });
  }
  const searchItems = extractSearchItems(searchCall.body);
  const baseTitles = searchItems.map((item) => normalizeSearchItem(item)).filter(Boolean);
  const uniqueIds = [...new Set(baseTitles.map((entry) => entry.id).filter(isNumericId))];

  // Enrich only the visible result page. These calls add bibliographic fields
  // that are not part of titlesummary, such as imprint, collation, PPN and subjects.
  const discoveryCalls = await Promise.all(
    uniqueIds.map((id) =>
      fetchWiseResponse(`${WISE_BASE_URL}/discovery/title/${encodeURIComponent(id)}`)
    )
  );
  const discoveryById = new Map(
    discoveryCalls.map((call, index) => [uniqueIds[index], call?.body || {}])
  );

  const titles = searchItems
    .map((item) => {
      const detailId = extractChildTitleId(item);
      return normalizeSearchItem(item, discoveryById.get(detailId) || {});
    })
    .filter(Boolean);
  const ids = titles.map((entry) => entry.id).filter(isNumericId);
  const total = extractTotal(searchCall.body, ids.length);

  const raw = {
    query,
    page: pageNumber,
    limit: limitNumber,
    total,
    ids,
    titles,
    suggestions: [],
    perspectives,
    selectedPerspectiveId,
    selectedSearchScope: selectedScope,
    selectedSort,
    selectedFacetFilters: asArray(facetFilter),
    searchResponse: searchCall.body,
    discoveryTitleResponses: discoveryCalls.map((call, index) => ({
      id: uniqueIds[index],
      url: call.url,
      status: call.status,
      body: call.body,
    })),
    resolvedItems: searchItems.map((item) => ({
      sourceId: extractSourceId(item),
      childTitleId: extractChildTitleId(item),
      detailId: extractChildTitleId(item),
      usable: isNumericId(extractChildTitleId(item)),
    })),
    debug: {
      calls: [perspectiveCall, searchCall, ...discoveryCalls],
    },
  };

  const mapped = mapWiseSearchToObaFull(raw);
  return res.status(200).json({ raw, mapped });
}
