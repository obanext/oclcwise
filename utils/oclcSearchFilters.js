// One contract for search navigation, detail links and OCLC requests.
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : value ? [value] : [];
const NBC_PERSPECTIVES = new Set(["3684", "3685", "3687", "3688"]);

export function isNbcPerspective(id, backend = "") {
  return backend ? text(backend).toLowerCase() === "nbcplus" : NBC_PERSPECTIVES.has(text(id));
}
export function isCollectionTerm(term) { return ["*", "*.*"].includes(text(term)); }
export function searchTermForBackend(term, nbc) {
  const value = text(term);
  if (isCollectionTerm(value)) return nbc ? "*" : "*.*";
  return value || (nbc ? "*" : "");
}
export function splitFacetFilter(filter) {
  const value = text(filter);
  const nbcSeparator = value.startsWith("nbc:") ? value.indexOf("_key:") : -1;
  const separator = nbcSeparator >= 0 ? nbcSeparator + 4 : value.indexOf(":");
  return separator < 0 ? ["", value] : [value.slice(0, separator), value.slice(separator + 1)];
}
export function expandFacetSelections(filters) {
  return [...new Set(list(filters).map(text).filter(Boolean).flatMap((filter) => {
    const [field, value] = splitFacetFilter(filter);
    // Only WISE uses | as OR. Never reinterpret an old NBC+ OR URL as AND.
    return field && !field.startsWith("nbc:")
      ? value.split("|").filter(Boolean).map((term) => `${field}:${term}`) : [filter];
  }))];
}
export function serializeFacetFilters(filters, nbc) {
  const selections = expandFacetSelections(filters);
  if (nbc) return selections; // Verified NBC+ contract: repeated criteria are AND.
  const grouped = new Map();
  for (const filter of selections) {
    const [field, value] = splitFacetFilter(filter);
    const terms = grouped.get(field) || [];
    if (!terms.includes(value)) terms.push(value);
    grouped.set(field, terms);
  }
  return Array.from(grouped, ([field, terms]) => field ? `${field}:${terms.join("|")}` : terms.join("|"));
}
export function validateSearchFilters({ facetFilters = [], termFilters = [], available = false, nbc }) {
  for (const filter of list(facetFilters)) {
    const [field, value] = splitFacetFilter(filter);
    if (!field || !value) return `Ongeldige facetFilter: ${filter}`;
    if (field.startsWith("nbc:") !== nbc) return `Filter ${field} hoort niet bij deze bron. Kies een filter uit de geselecteerde bron.`;
    if (nbc && value.includes("|")) return "NBC+ ondersteunt de gebruikte |-notatie niet. Kies afzonderlijke facetwaarden; deze worden gecombineerd met EN.";
  }
  if (nbc && list(termFilters).length) return "termFilter is voor deze NBC+-route niet gevalideerd. Gebruik term met searchScope of de geleverde NBC+-facetten.";
  if (nbc && available) return "Nu aanwezig is een filter voor lokaal WISE-materiaal.";
  return "";
}
export function searchStateForPerspective(state, perspectiveId) {
  return { ...state, q: isCollectionTerm(state.q) ? "" : text(state.q), nextSearchRequested: true,
    nextPage: 1, nextPerspectiveId: text(perspectiveId), nextSearchScope: "anything", nextSort: "2910",
    nextFacetFilters: [], nextTermFilters: [], nextFilterAvailableTitles: false };
}
export function buildSearchUrl(state = {}, { api = false, limit = 20, backend = "" } = {}) {
  const { q = "", nextSearchRequested = false, nextPage = 1, nextPerspectiveId = "3682",
    nextSearchScope = "anything", nextSort = "2910", nextFacetFilters = [], nextTermFilters = [],
    nextFilterAvailableTitles = false } = state;
  const route = api ? "/api/oclc-search" : "/oclc-search";
  const shouldSearch = nextSearchRequested || text(q) || list(nextFacetFilters).length || list(nextTermFilters).length || nextFilterAvailableTitles;
  if (!shouldSearch) return route;
  const params = new URLSearchParams();
  const term = searchTermForBackend(q, isNbcPerspective(nextPerspectiveId, backend));
  if (term) params.set("term", term);
  params.set("page", String(nextPage || 1));
  if (api) params.set("limit", String(limit));
  params.set("perspectiveId", nextPerspectiveId);
  params.set("searchScope", nextSearchScope);
  params.set("sort", nextSort);
  expandFacetSelections(nextFacetFilters).forEach((filter) => params.append("facetFilter", filter));
  list(nextTermFilters).map(text).filter(Boolean).forEach((filter) => params.append("termFilter", filter));
  if (nextFilterAvailableTitles) params.set("filterAvailableTitles", "true");
  return `${route}?${params}`;
}
const LABEL_CACHE_KEY = "oclc-facet-labels";
export function readFacetLabels() {
  try {
    const cache = JSON.parse(window.sessionStorage.getItem(LABEL_CACHE_KEY) || "{}");
    return cache && typeof cache === "object" && !Array.isArray(cache) ? cache : {};
  } catch { return {}; }
}
export function rememberFacetLabels(perspectiveId, entries) {
  const cache = readFacetLabels();
  for (const [filter, label] of entries) if (text(filter) && text(label)) cache[`${perspectiveId}/${filter}`] = text(label);
  const bounded = Object.fromEntries(Object.entries(cache).slice(-2000));
  try { window.sessionStorage.setItem(LABEL_CACHE_KEY, JSON.stringify(bounded)); } catch { /* Optional presentation cache. */ }
  return bounded;
}
export function rememberDetailFilterLabel(href, label) {
  const params = new URLSearchParams(String(href).split("?")[1] || "");
  rememberFacetLabels(params.get("perspectiveId"), params.getAll("facetFilter").map((filter) => [filter, label]));
}
