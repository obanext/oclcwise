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
  canonicalSearchScope,
  extractPerspectives,
  resolveSearchConfiguration,
} from "../../utils/wisePerspective.js";
import { fetchWiseResponse } from "../../utils/wiseResponse.js";
import { fetchWiseSuggestions } from "../../utils/wiseSuggestions.js";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

function isNumericId(value) {
  return /^\d+$/.test(text(value));
}

function appendParam(url, key, value) {
  if (value === undefined || value === null || value === "") return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function appendRepeatedParam(url, key, values) {
  return asArray(values).reduce((nextUrl, value) => appendParam(nextUrl, key, value), url);
}

function combineFacetFilters(values) {
  const grouped = new Map();
  const ungrouped = [];

  asArray(values).map(text).filter(Boolean).forEach((filter) => {
    const separatorIndex = filter.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex === filter.length - 1) {
      if (!ungrouped.includes(filter)) ungrouped.push(filter);
      return;
    }

    const field = filter.slice(0, separatorIndex);
    const term = filter.slice(separatorIndex + 1);
    const terms = grouped.get(field) || [];

    if (!terms.includes(term)) terms.push(term);
    grouped.set(field, terms);
  });

  return [
    ...Array.from(grouped, ([field, terms]) => `${field}:${terms.join("|")}`),
    ...ungrouped,
  ];
}

function extractItems(body) {
  if (!body || typeof body !== "object") return [];
  return asArray(
    body.items ||
      body.titles ||
      body.title ||
      body.results ||
      body.result ||
      body.content ||
      body.documents ||
      body.titleSummaries ||
      body.summaries ||
      []
  );
}

function extractChildTitleId(item = {}) {
  const metadata = metadataObject(item);
  const candidates = [
    item?.childTitleList?.[0]?.childTitleId,
    item?.title?.childTitleList?.[0]?.childTitleId,
    item?.childTitleIds?.[0],
    item?.title?.childTitleIds?.[0],
    item?.childTitleId,
    item?.title?.childTitleId,
    metadataScalar(metadata, [
      "childTitleId",
      "titleId",
      "titleNumber",
      "titleNo",
      "titlenumber",
      "titelnummer",
      "cWiseId",
      "wiseId",
    ]),
    item?.id,
    item?.title?.id,
  ];

  return candidates.map(text).find(isNumericId) || "";
}

function extractSourceId(item = {}) {
  const metadata = metadataObject(item);
  return firstText(
    item?.id,
    item?.title?.id,
    item?.frbrkey,
    item?.title?.frbrkey,
    metadataScalar(metadata, ["id", "frbrkey", "frbrId", "recordId"])
  );
}

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function metadataObject(item = {}) {
  const metadata = item?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function normalizedMetadataKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function metadataValue(metadata, keys = []) {
  const entries = Object.entries(metadata || {});
  const normalized = new Map(entries.map(([key, value]) => [normalizedMetadataKey(key), value]));

  for (const key of keys) {
    const value = normalized.get(normalizedMetadataKey(key));
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return undefined;
}

function metadataValueByPattern(metadata, includes = [], excludes = []) {
  for (const [key, value] of Object.entries(metadata || {})) {
    const normalized = normalizedMetadataKey(key);
    if (!includes.some((part) => normalized.includes(normalizedMetadataKey(part)))) continue;
    if (excludes.some((part) => normalized.includes(normalizedMetadataKey(part)))) continue;
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return undefined;
}

function scalarValue(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = scalarValue(entry);
      if (candidate) return candidate;
    }
    return "";
  }

  if (value && typeof value === "object") {
    return firstText(
      scalarValue(value.value),
      scalarValue(value.text),
      scalarValue(value.label),
      scalarValue(value.labelText),
      scalarValue(value.description),
      scalarValue(value.name),
      scalarValue(value.title)
    );
  }

  return text(value);
}

function metadataScalar(metadata, keys = [], includes = [], excludes = []) {
  return scalarValue(
    metadataValue(metadata, keys) ?? metadataValueByPattern(metadata, includes, excludes)
  );
}

function metadataArray(metadata, keys = [], includes = [], excludes = []) {
  const value = metadataValue(metadata, keys) ?? metadataValueByPattern(metadata, includes, excludes);
  if (value === undefined || value === null || value === "") return [];
  return asArray(value).map(scalarValue).filter(Boolean);
}

function normalizePerspectives(perspectiveBody = {}) {
  return asArray(perspectiveBody?.perspective)
    .slice()
    .sort((a, b) => Number(a?.sortIndex ?? 0) - Number(b?.sortIndex ?? 0))
    .map((perspective) => ({
      id: text(perspective?.id),
      label: firstText(perspective?.labelText, perspective?.labelKey, perspective?.id),
      labelKey: text(perspective?.labelKey),
      backend: text(perspective?.backend),
      sortIndex: perspective?.sortIndex ?? null,
      links: asArray(perspective?.links).map((link) => ({
        rel: text(link?.rel),
        href: text(link?.href),
        raw: link,
      })),
      searchScopes: asArray(perspective?.searchScopes)
        .slice()
        .sort((a, b) => Number(a?.sortIndex ?? 0) - Number(b?.sortIndex ?? 0))
        .map((scope) => ({
          id: text(scope?.id),
          value: canonicalSearchScope(
            firstText(scope?.labelText, scope?.labelKey, scope?.id)
          ),
          label: firstText(scope?.labelText, scope?.labelKey, scope?.id),
          labelKey: text(scope?.labelKey),
          sortIndex: scope?.sortIndex ?? null,
          links: asArray(scope?.links).map((link) => ({
            rel: text(link?.rel),
            href: text(link?.href),
            raw: link,
          })),
          raw: scope,
        })),
      sortings: asArray(perspective?.sortings)
        .slice()
        .sort((a, b) => Number(a?.sortIndex ?? 0) - Number(b?.sortIndex ?? 0))
        .map((sorting) => ({
          id: text(sorting?.id),
          label: firstText(sorting?.labelText, sorting?.labelKey, sorting?.id),
          labelKey: text(sorting?.labelKey),
          asc: Boolean(sorting?.sortAsc),
          desc: Boolean(sorting?.sortDesc),
          sortIndex: sorting?.sortIndex ?? null,
          raw: sorting,
        })),
      raw: perspective,
    }));
}

function normalizeSortkeys(searchBody = {}, selectedPerspective = {}) {
  const source = asArray(searchBody?.sortkeys).length
    ? asArray(searchBody?.sortkeys)
    : asArray(selectedPerspective?.sortings);

  return source.map((sort, index) => ({
    id: text(sort?.id),
    label: firstText(sort?.label, sort?.labelText, sort?.labelKey, sort?.id),
    labelKey: text(sort?.labelKey || sort?.label),
    asc: Boolean(sort?.asc ?? sort?.sortAsc),
    desc: Boolean(sort?.desc ?? sort?.sortDesc),
    sortIndex: sort?.sortIndex ?? index,
    raw: sort,
  }));
}

function normalizeFacets(searchBody = {}) {
  return asArray(
    searchBody?.facets ||
      searchBody?.facet ||
      searchBody?.filters ||
      searchBody?.filter ||
      searchBody?.refinements ||
      searchBody?.refinement ||
      []
  )
    .map((facet) => {
      const name = firstText(facet?.name, facet?.field, facet?.key, facet?.id, facet?.labelKey);
      const labelKey = firstText(facet?.label, facet?.labelKey);
      const values = asArray(
        facet?.filterList ||
          facet?.values ||
          facet?.value ||
          facet?.items ||
          facet?.options ||
          facet?.entries ||
          facet?.buckets ||
          []
      )
        .map((value) => {
          const key = firstText(value?.key, value?.field, name);
          const term = firstText(value?.term, value?.value, value?.id, value?.name, value?.label);
          const label = firstText(value?.label, value?.labelText, value?.name, value?.value, value?.term, value?.id);
          const facetFilter = firstText(value?.facetFilter, value?.filter, value?.query) || (key && term ? `${key}:${term}` : "");

          return {
            id: text(value?.id),
            key,
            term,
            label,
            count: Number(value?.count ?? value?.total ?? value?.numberOfResults ?? value?.hits ?? 0),
            facetFilter,
            raw: value,
          };
        })
        .filter((value) => value.key || value.term || value.label);

      return {
        id: text(facet?.id),
        name,
        labelKey,
        label: firstText(facet?.labelText, facet?.label, facet?.labelKey, name),
        values,
        raw: facet,
      };
    })
    .filter((facet) => facet.name || facet.label || facet.values.length);
}

function normalizeItem(item = {}, index = 0) {
  const metadata = metadataObject(item);
  const detailId = extractChildTitleId(item);
  const sourceId = extractSourceId(item);
  const authorSource = item?.author || metadataValue(metadata, ["author", "mainAuthor", "authorFacet", "auteur", "creator"]) || {};
  const mediaSource = item?.media || metadataValue(metadata, ["media", "medium", "mediumType", "mediumTypeCode"]) || {};
  const mediumGroupSource = item?.mediumGroup || metadataValue(metadata, ["mediumGroup", "mediumGroupCode"]) || {};
  const languageSource = asArray(item?.language).length
    ? asArray(item?.language)
    : asArray(metadataValue(metadata, ["language", "languages", "languageCode", "taal"]));
  const language = languageSource.map((entry) => ({
    code: text(entry?.code || (typeof entry === "string" ? entry : "")),
    description: scalarValue(entry?.description ?? entry),
    raw: entry,
  }));

  const childTitleSource = asArray(item?.childTitleList).length
    ? asArray(item?.childTitleList)
    : asArray(metadataValue(metadata, ["childTitleList"]));
  const childTitleList = childTitleSource.map((child) => ({
    id: text(child?.id),
    childTitleId: text(child?.childTitleId),
    childOrigin: text(child?.childOrigin),
    childTitle: text(child?.childTitle),
    childSubtitle: text(child?.childSubtitle),
    childEdition: text(child?.childEdition),
    childPublicationYear: text(child?.childPublicationYear),
    childMedia: child?.childMedia || null,
    childLanguage: child?.childLanguage || null,
    raw: child,
  }));

  const title = firstText(
    item?.title,
    metadataScalar(
      metadata,
      ["title", "mainTitle", "displayTitle", "titleDisplay", "titel"],
      ["title", "titel"],
      ["id", "number", "no", "sort", "series", "child", "subtitle"]
    )
  );
  const mainTitle = firstText(
    item?.mainTitle,
    metadataScalar(metadata, ["mainTitle", "title", "titel"], ["maintitle"], ["id", "number"])
  );
  const subtitle = firstText(
    item?.subtitle,
    metadataScalar(metadata, ["subtitle", "subTitle", "ondertitel"], ["subtitle", "ondertitel"], ["id"])
  );
  const authorDescription = firstText(
    authorSource?.description,
    typeof authorSource === "string" ? authorSource : "",
    metadataScalar(metadata, ["author", "mainAuthor", "authorFacet", "auteur", "creator"], ["author", "auteur", "creator"], ["id", "number", "sort"])
  );
  const publicationYear = firstText(
    item?.publicationYear,
    metadataScalar(metadata, ["publicationYear", "year", "publicationDate", "jaar"], ["publicationyear", "jaar"], ["facet"])
  );
  const isbnValues = asArray(item?.isbn).length
    ? asArray(item?.isbn).map(text).filter(Boolean)
    : metadataArray(metadata, ["isbn", "isbn13", "isbn10"], ["isbn"], ["facet"]);

  return {
    index,
    id: detailId || sourceId || text(item?.id),
    detailId,
    sourceId,
    frbrId: firstText(item?.id, metadataScalar(metadata, ["frbrId", "frbrkey"])),
    frbrkey: firstText(item?.frbrkey, metadataScalar(metadata, ["frbrkey"])),
    cWiseId: firstText(item?.cWiseId, metadataScalar(metadata, ["cWiseId", "cwiseid", "wiseId"])),
    origin: firstText(item?.origin, metadataScalar(metadata, ["origin"])),
    detailHref: detailId ? `/oclc-detail/${encodeURIComponent(detailId)}` : "",
    title,
    mainTitle,
    subtitle,
    volume: firstText(item?.volume, metadataScalar(metadata, ["volume"])),
    volumeTitle: firstText(item?.volumeTitle, metadataScalar(metadata, ["volumeTitle"])),
    author: {
      description: authorDescription,
      thesaurusNumber: text(authorSource?.thesaurusNumber),
      searchable: Boolean(authorSource?.searchable),
      type: text(authorSource?.type),
      qualifier: text(authorSource?.qualifier),
      addition: text(authorSource?.addition),
      raw: authorSource,
    },
    contents: firstText(item?.contents, metadataScalar(metadata, ["contents", "summary", "description"])),
    contentsSchoolWise: text(item?.contentsSchoolWise),
    classification: asArray(item?.classification).map((entry) => ({
      description: text(entry?.description || entry),
      thesaurusNumber: text(entry?.thesaurusNumber),
      searchable: Boolean(entry?.searchable),
      classificationSystem: text(entry?.classificationSystem),
      raw: entry,
    })),
    genre: asArray(item?.genre).length
      ? asArray(item?.genre).map((entry) => ({
          code: text(entry?.code),
          description: scalarValue(entry?.description ?? entry),
          imageCode: text(entry?.imageCode),
          raw: entry,
        }))
      : metadataArray(metadata, ["genre", "genreCode"], ["genre"], ["facet"]).map((entry) => ({
          code: "",
          description: entry,
          imageCode: "",
          raw: entry,
        })),
    media: {
      code: text(mediaSource?.code || (typeof mediaSource === "string" ? mediaSource : "")),
      icon: text(mediaSource?.icon),
      description: scalarValue(mediaSource?.description ?? mediaSource),
      raw: mediaSource,
    },
    mediumGroup: {
      code: text(mediumGroupSource?.code || (typeof mediumGroupSource === "string" ? mediumGroupSource : "")),
      description: scalarValue(mediumGroupSource?.description ?? mediumGroupSource),
      raw: mediumGroupSource,
    },
    isbn: isbnValues,
    imageUrls: {
      small: firstText(item?.imageUrls?.small, metadataScalar(metadata, ["imageSmall", "smallImageUrl"])),
      medium: firstText(item?.imageUrls?.medium, metadataScalar(metadata, ["imageMedium", "mediumImageUrl", "imageUrl"])),
      large: firstText(item?.imageUrls?.large, metadataScalar(metadata, ["imageLarge", "largeImageUrl"])),
      raw: item?.imageUrls || {},
    },
    language,
    publicationYear,
    edition: firstText(item?.edition, metadataScalar(metadata, ["edition"])),
    informative: Boolean(item?.informative),
    narrative: Boolean(item?.narrative),
    youth: Boolean(item?.youth),
    adult: Boolean(item?.adult),
    frbrDocumentType: firstText(item?.frbrDocumentType, metadataScalar(metadata, ["frbrDocumentType", "documentType"])),
    childTitleList,
    subjectPim: item?.subjectPim
      ? {
          description: text(item?.subjectPim?.description || item?.subjectPim),
          thesaurusNumber: text(item?.subjectPim?.thesaurusNumber),
          searchable: Boolean(item?.subjectPim?.searchable),
          qualifier: text(item?.subjectPim?.qualifier),
          code: text(item?.subjectPim?.code),
          raw: item?.subjectPim,
        }
      : metadataScalar(metadata, ["subject", "subjectPim", "onderwerp"], ["subject", "onderwerp"], ["id", "facet"])
        ? {
            description: metadataScalar(metadata, ["subject", "subjectPim", "onderwerp"], ["subject", "onderwerp"], ["id", "facet"]),
            thesaurusNumber: "",
            searchable: false,
            qualifier: "",
            code: "",
            raw: metadataValue(metadata, ["subject", "subjectPim", "onderwerp"]),
          }
        : null,
    metadata,
    raw: item,
  };
}

function normalizeSearchResponse({
  query,
  pageNumber,
  limitNumber,
  offset,
  selectedPerspectiveId,
  selectedSearchScope,
  selectedSort,
  selectedFacetFilters,
  selectedTermFilters,
  selectedFilterAvailableTitles,
  perspectiveCall,
  searchCall,
}) {
  const perspectives = normalizePerspectives(perspectiveCall?.body);
  const selectedPerspective =
    perspectives.find((entry) => String(entry.id) === String(selectedPerspectiveId)) || perspectives[0] || null;
  const searchBody = searchCall?.body && typeof searchCall.body === "object" ? searchCall.body : {};
  const rawItems = extractItems(searchBody);

  return {
    query,
    branchId: text(searchBody?.branchId || WISE_BRANCH_ID),
    clientType: WISE_CLIENT_TYPE,
    selectedPerspectiveId: text(selectedPerspectiveId),
    selectedSearchScope: text(selectedSearchScope),
    selectedSort: text(selectedSort),
    selectedFacetFilters: asArray(selectedFacetFilters).map(text).filter(Boolean),
    selectedTermFilters: asArray(selectedTermFilters).map(text).filter(Boolean),
    selectedFilterAvailableTitles: Boolean(selectedFilterAvailableTitles),
    pagination: {
      page: pageNumber,
      offset,
      limit: limitNumber,
      total: Number(searchBody?.total ?? searchBody?.totalElements ?? searchBody?.count ?? rawItems.length ?? 0),
    },
    perspectives,
    selectedPerspective,
    searchScopes: asArray(selectedPerspective?.searchScopes),
    sortkeys: normalizeSortkeys(searchBody, selectedPerspective),
    facets: normalizeFacets(searchBody),
    items: rawItems.map((item, index) => normalizeItem(item, offset + index + 1)),
    spellcheck: searchBody?.spellcheck || null,
    debug: {
      calls: [perspectiveCall, searchCall].filter(Boolean),
    },
    raw: {
      perspectiveResponse: perspectiveCall?.body || null,
      searchResponse: searchCall?.body || null,
    },
  };
}

export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const {
    term = "",
    q = "",
    page = "1",
    limit = "20",
    suggest = "",
    perspectiveId = WISE_DEFAULT_PERSPECTIVE_ID,
    searchScope = WISE_DEFAULT_SCOPE,
    sort = WISE_DEFAULT_SORT,
    facetFilter = [],
    termFilter = [],
    filterAvailableTitles = "false",
  } = req.query;

  const query = text(term || q);

  if (suggest === "1") {
    const suggestionResult = await fetchWiseSuggestions(query, searchScope);
    return res.status(suggestionResult.ok ? 200 : suggestionResult.status || 502).json({
      suggestions: suggestionResult.suggestions,
      error: suggestionResult.error || undefined,
      debug: { calls: suggestionResult.call ? [suggestionResult.call] : [] },
    });
  }

  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = Math.max(Math.min(Number(limit) || 20, 100), 1);
  const offset = (pageNumber - 1) * limitNumber;
  const rawFacetFilters = asArray(facetFilter).map(text).filter(Boolean);
  const selectedTermFilters = asArray(termFilter).map(text).filter(Boolean);
  const selectedFilterAvailableTitles =
    text(filterAvailableTitles).toLowerCase() === "true" ||
    text(filterAvailableTitles) === "1" ||
    rawFacetFilters.includes("availableNow:AT_THE_LIBRARY");
  const selectedFacetFilters = rawFacetFilters.filter((value) => value !== "availableNow:AT_THE_LIBRARY");

  const perspectiveUrl =
    `${WISE_BASE_URL}/branch/${encodeURIComponent(WISE_BRANCH_ID)}` +
    `/clienttype/${encodeURIComponent(WISE_CLIENT_TYPE)}/perspective`;
  const perspectiveCall = await fetchWiseResponse(perspectiveUrl);

  if (!perspectiveCall.ok) {
    return res.status(perspectiveCall.status || 500).json({
      error: "Perspectives ophalen mislukt",
      debug: { calls: [perspectiveCall] },
    });
  }

  const scopeWasProvided = Object.prototype.hasOwnProperty.call(req.query, "searchScope");
  const sortWasProvided = Object.prototype.hasOwnProperty.call(req.query, "sort");
  const configuration = resolveSearchConfiguration({
    perspectives: extractPerspectives(perspectiveCall.body),
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

  const {
    selectedPerspectiveId,
    selectedScope: selectedSearchScope,
    selectedSort,
  } = configuration;

  if (
    !query &&
    !selectedFacetFilters.length &&
    !selectedTermFilters.length &&
    !selectedFilterAvailableTitles
  ) {
    return res.status(200).json(
      normalizeSearchResponse({
        query,
        pageNumber,
        limitNumber,
        offset,
        selectedPerspectiveId,
        selectedSearchScope,
        selectedSort,
        selectedFacetFilters,
        selectedTermFilters,
        selectedFilterAvailableTitles,
        perspectiveCall,
        searchCall: null,
      })
    );
  }

  let searchUrl =
    `${WISE_BASE_URL}/branch/${encodeURIComponent(WISE_BRANCH_ID)}/perspective/${encodeURIComponent(selectedPerspectiveId)}/search` +
    `?returnType=default` +
    `&offset=${offset}` +
    `&limit=${limitNumber}` +
    `&searchScope=${encodeURIComponent(selectedSearchScope)}` +
    `&filterAvailableTitles=${encodeURIComponent(selectedFilterAvailableTitles ? "true" : "false")}` +
    `&enableMultiSelectFaceting=true`;

  if (sortWasProvided) {
    searchUrl = appendParam(searchUrl, "sort", selectedSort);
  }

  if (query && query !== "*.*") {
    searchUrl = appendParam(searchUrl, "term", query);
  }

  searchUrl = appendRepeatedParam(searchUrl, "facetFilter", combineFacetFilters(selectedFacetFilters));
  searchUrl = appendRepeatedParam(searchUrl, "termFilter", selectedTermFilters);

  const searchCall = await fetchWiseResponse(searchUrl);

  if (!searchCall.ok) {
    return res.status(searchCall.status || 500).json({
      error: "Zoekopdracht ophalen mislukt",
      debug: { calls: [perspectiveCall, searchCall] },
    });
  }

  return res.status(200).json(
    normalizeSearchResponse({
      query,
      pageNumber,
      limitNumber,
      offset,
      selectedPerspectiveId,
      selectedSearchScope,
      selectedSort,
      selectedFacetFilters,
      selectedTermFilters,
      selectedFilterAvailableTitles,
      perspectiveCall,
      searchCall,
    })
  );
}
