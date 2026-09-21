import { WISE_BASE_URL, WISE_BRANCH_ID, WISE_DEFAULT_PERSPECTIVE_ID, WISE_DEFAULT_SORT } from "./wiseConfig.js";
import { buildSearchUrl, isNbcPerspective, searchTermForBackend, serializeFacetFilters, validateSearchFilters } from "./oclcSearchFilters.js";
import { resolvePreselect } from "./oclcPreselect.js";

const text = (value) => String(value ?? "").trim();

export const EMPTY_ADVANCED_FORM = {
  perspectiveId: WISE_DEFAULT_PERSPECTIVE_ID,
  term: "", title: "", author: "", authorFacetValue: "", mediumTypeCode: "", branchId: "",
  placementCode: "", year: "", yearFrom: "", yearTo: "", genreCode: "", languageCode: "",
  subject: "", issn: "", publisher: "", isbn: "", series: "", collection: "",
  targetAudienceCode: "", content: "", available: false,
};

export const NBC_ADVANCED_FACETS = {
  formats: "nbc:carrierOB_key",
  genres: "nbc:subjectNbdgenre_key",
  languages: "nbc:language_key",
  youth: "nbc:audienceNbcLeeftijdscategorie_key",
};
const NBC_FORM_FIELDS = {
  mediumTypeCode: NBC_ADVANCED_FACETS.formats,
  genreCode: NBC_ADVANCED_FACETS.genres,
  languageCode: NBC_ADVANCED_FACETS.languages,
  targetAudienceCode: NBC_ADVANCED_FACETS.youth,
};
const LOCAL_ONLY_FIELDS = ["branchId", "placementCode", "yearFrom", "yearTo", "issn", "publisher", "isbn", "collection", "content"];

export function advancedSourceChange(form, value, perspectives = []) {
  const next = resolvePreselect(value);
  const backend = (id) => perspectives.find((p) => p.id === id)?.backend || "";
  const resetCriteria = next.perspectiveId !== form.perspectiveId && (
    isNbcPerspective(form.perspectiveId, backend(form.perspectiveId)) ||
    isNbcPerspective(next.perspectiveId, backend(next.perspectiveId))
  );
  return {
    form: { ...(resetCriteria ? { ...EMPTY_ADVANCED_FORM, term: form.term } : form), ...next },
    resetCriteria,
  };
}

export function determinePrimarySearch(form) {
  for (const [source, searchScope] of [["subject", "subject"], ["term", "anything"], ["title", "title"], ["author", "author"], ["series", "series"]]) {
    if (text(form[source])) return { term: text(form[source]), searchScope, source };
  }
  return { term: "", searchScope: "anything", source: "" };
}

export function validateAdvancedSearch(form, backend = "") {
  const primary = determinePrimarySearch(form);
  if (form.subject && Object.keys(EMPTY_ADVANCED_FORM).some((key) =>
    !["perspectiveId", "subject", "authorFacetValue"].includes(key) && Boolean(form[key]))) {
    return "Onderwerp kan niet met andere zoekcriteria worden gecombineerd.";
  }
  if (text(form.author) && primary.source !== "author" && !text(form.authorFacetValue)) {
    return "Kies de auteur uit de OCLC-suggesties.";
  }
  if (isNbcPerspective(form.perspectiveId, backend)) {
    if (LOCAL_ONLY_FIELDS.some((key) => text(form[key])) || form.available) {
      return "Bibliotheek, Aanwezig, jaarbereik en de velden met (check) zijn alleen beschikbaar voor lokale WISE-bronnen.";
    }
    if (text(form.title) && primary.source !== "title") {
      return "Bij deze bron kan Titel niet naast Vrij zoeken worden gebruikt. Gebruik één hoofdzoekterm en combineer die met de beschikbare filters.";
    }
    if (text(form.series) && primary.source !== "series") {
      return "Bij deze bron kan Reeks alleen als hoofdzoekterm worden gebruikt, eventueel met de beschikbare filters.";
    }
    if (["3684", "3685"].includes(form.perspectiveId) && text(form.mediumTypeCode)) {
      return "Het formaat is al bepaald door de gekozen e-book- of luisterboekcatalogus.";
    }
    for (const [key, field] of Object.entries(NBC_FORM_FIELDS)) {
      if (text(form[key]) && !text(form[key]).startsWith(`${field}:`)) {
        return "Kies een filter uit de geselecteerde bron; lokale WISE-codes gelden niet voor NBC+.";
      }
    }
  }
  return "";
}

export function buildAdvancedSearchState(form, backend = "") {
  const nbc = isNbcPerspective(form.perspectiveId, backend);
  const primary = determinePrimarySearch(form);
  const year = text(form.year);
  const from = text(form.yearFrom);
  const to = text(form.yearTo);
  const facets = [];
  const terms = [];
  const addFacet = (field, value) => { if (text(value)) facets.push(`${field}:${text(value)}`); };
  const addTerm = (field, value) => { if (text(value)) terms.push(`${field}:${text(value)}`); };

  if (primary.source !== "author" && text(form.author)) {
    addFacet(nbc ? "nbc:creatorNameProfile1NtaOrTitle_key" : "authorFacet", form.authorFacetValue);
  }
  if (nbc) {
    // Values are complete key:term pairs returned by this perspective, never translated WISE codes.
    for (const key of Object.keys(NBC_FORM_FIELDS)) if (text(form[key])) facets.push(text(form[key]));
    if (/^\d+$/.test(year)) addFacet("nbc:publicationYear_key", year);
  } else {
    for (const key of ["mediumTypeCode", "branchId", "genreCode", "languageCode", "targetAudienceCode"]) addFacet(key, form[key]);
    if (/^\d+$/.test(year)) addFacet("customPublicationYear", year);
    else if (/^\d+$/.test(from) && /^\d+$/.test(to)) addFacet("customPublicationYear", `${from}-${to}`);
    if (primary.source !== "series") addFacet("series", form.series);
    if (primary.source !== "title") addTerm("title", form.title);
    for (const key of ["placementCode", "issn", "publisher", "isbn", "content"]) addTerm(key, form[key]);
  }
  return {
    q: searchTermForBackend(primary.term, nbc), nextSearchRequested: true, nextPage: 1,
    nextPerspectiveId: form.perspectiveId, nextSearchScope: primary.searchScope,
    nextSort: WISE_DEFAULT_SORT, nextFacetFilters: facets, nextTermFilters: terms,
    nextFilterAvailableTitles: Boolean(form.available),
  };
}

export function buildAdvancedSearch(form, backend = "") {
  const nbc = isNbcPerspective(form.perspectiveId, backend);
  const state = buildAdvancedSearchState(form, backend);
  const error = validateAdvancedSearch(form, backend) || validateSearchFilters({
    nbc, facetFilters: state.nextFacetFilters, termFilters: state.nextTermFilters,
    available: state.nextFilterAvailableTitles,
  });
  if (error) return { error, href: "", request: "", state };
  const params = new URLSearchParams({
    returnType: "default", offset: "0", limit: "20", searchScope: state.nextSearchScope,
    filterAvailableTitles: String(state.nextFilterAvailableTitles), enableMultiSelectFaceting: "true",
    sort: `${WISE_DEFAULT_SORT} desc`,
  });
  if (state.q) params.set("term", state.q);
  serializeFacetFilters(state.nextFacetFilters, nbc).forEach((value) => params.append("facetFilter", value));
  state.nextTermFilters.forEach((value) => params.append("termFilter", value));
  // Match the shared API's encodeURIComponent serialization in the request preview.
  const query = Array.from(params, ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  return {
    error: "", state, href: buildSearchUrl(state, { backend }),
    request: `${WISE_BASE_URL}/branch/${WISE_BRANCH_ID}/perspective/${form.perspectiveId}/titlesummary?${query}`,
  };
}

export function advancedFacetOptions(data = {}, field) {
  const facet = (data.facets || []).find((entry) => entry.name === field);
  const values = facet?.values || facet?.filterList || [];
  return values.map((option) => ({
    code: text(option.facetFilter) || `${option.key || field}:${text(option.term)}`,
    label: text(option.label || option.term),
  })).filter((option) => option.label && option.code.startsWith(`${field}:`) && option.code.length > field.length + 1);
}

export function getAuthorFacetOptions(data = {}, nbc = false) {
  const field = nbc ? "nbc:creatorNameProfile1NtaOrTitle_key" : "authorFacet";
  return advancedFacetOptions(data, field).map((option) => ({
    value: option.code.slice(field.length + 1), label: option.label,
  }));
}

export function findAuthorFacetValue(options, value) {
  const needle = text(value).toLocaleLowerCase("nl");
  if (!needle) return "";
  const match = options.find((option) => [option.value, option.label].some((entry) => text(entry).toLocaleLowerCase("nl") === needle));
  return match?.value || "";
}
