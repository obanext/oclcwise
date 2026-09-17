import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  OCLC_SEARCH_FACET_DEFINITIONS,
  buildOclcAllFieldRows,
  buildOclcFilterRows,
  buildOclcUsedFieldRows,
  findOclcSearchFacetDefinition,
  toOclcAllFieldsCsv,
  toOclcFilterCsv,
  toOclcUsedFieldsCsv,
} from "../utils/oclcSearchMappingRows";

import { buildSearchUrl, expandFacetSelections, isCollectionTerm, isNbcPerspective,
  readFacetLabels, rememberFacetLabels, searchStateForPerspective, splitFacetFilter } from "../utils/oclcSearchFilters.js";

const pretty = (value) => JSON.stringify(value, null, 2);

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const DEFAULT_PERSPECTIVE_ID = "3682";
const DEFAULT_SCOPE = "anything";
const DEFAULT_SORT = "2910";
const DEFAULT_LIMIT = 20;
const DEFAULT_VISIBLE_FACET_VALUES = 100;

const SORT_LABELS = {
  "SORTBY-RELEVANCE": "Relevantie",
  "SORTBY-POPULARITY": "Populariteit",
  "SORTBY-DATE": "Datum",
  "SORTBY-AUTHOR": "Auteur",
  "SORTBY-TITLE": "Titel",
};

const FILTER_LABELS = {
  audienceCode: "Doelgroep",
  authorFacet: "Auteur",
  branchId: "Waar",
  customPublicationYear: "Jaar van uitgave",
  fictionNonfictionCode: "Fictie/Non-fictie",
  genreCode: "Genre",
  languageCode: "Taal",
  mediumTypeCode: "Type",
  publicationYear: "Jaar van uitgave",
  series: "Serie",
  subject: "Onderwerp",
  targetAudienceCode: "Leeftijd / niveau",
  "nbc:carrierOB_key": "Type",
  "nbc:creatorNameProfile1NtaOrTitle_key": "Auteur",
  "nbc:subjectNbchoofdcategorie_key": "Fictie/Non-fictie",
  "nbc:subjectNbdtrefwoorden_key": "Onderwerp",
  "nbc:subjectNbdgenre_key": "Genre",
  "nbc:language_key": "Taal",
  "nbc:publicationYear_key": "Jaar van uitgave",
  "nbc:audienceNbcLeeftijdscategorie_key": "Leeftijd / niveau",
};

function splitFilterCriterion(filter) { return splitFacetFilter(filter); }

function readableFilterCriteria(facetFilters = [], termFilters = [], available = false) {
  const criteria = [...asArray(facetFilters), ...asArray(termFilters)]
    .map(text)
    .filter(Boolean)
    .map((filter) => {
      const [field, rawValue] = splitFilterCriterion(filter);
      if (!field) return rawValue;
      const value = rawValue.replace(/\|/g, " of ");
      return `${FILTER_LABELS[field] || field}: ${value}`;
    });

  if (available) criteria.push("Beschikbaarheid: Nu aanwezig");
  return criteria.join(", ");
}

function activeFilterLabel(filterValue, facets = [], labels = {}, perspectiveId = "") {
  const value = text(filterValue);
  if (!value) return "";

  for (const facet of asArray(facets)) {
    const option = asArray(facet?.values || facet?.filterList)
      .find((candidate) => rawFacetFilterValue(facet, candidate) === value);
    const optionLabel = rawFacetValueLabel(option);
    if (optionLabel) return optionLabel;
  }

  const cachedLabel = labels[`${perspectiveId}/${value}`];
  if (cachedLabel) return cachedLabel;
  const [field, rawValue] = splitFilterCriterion(value);
  const readableValue = rawValue.replace(/\|/g, " of ");
  return field && FILTER_LABELS[field]
    ? `${FILTER_LABELS[field]}: ${readableValue}`
    : readableValue || value;
}

function rawSortLabel(sort = {}) {
  const labelKey = text(sort.labelKey || sort.label);
  return SORT_LABELS[labelKey] || text(sort.label) || text(sort.id);
}

function rawFacetTitle(facet = {}) {
  const definition = findOclcSearchFacetDefinition(facet);
  if (definition) return definition.siteLabel;

  const name = text(facet.name);
  const label = text(facet.label || facet.labelKey);

  if (name && label && label !== name) return `${name} — ${label}`;
  return name || label || "facet";
}

function rawFacetValueLabel(option = {}) {
  return text(option?.raw?.label || option?.label || option?.term);
}

function yearOnly(value) {
  const match = text(value).match(/(?:18|19|20|21)\d{2}/);
  return match ? match[0] : "";
}

function displayedFacetValueLabel(definition = {}, option = {}) {
  if (definition.name === "availableNow") return "Nu aanwezig";
  if (definition.name === "publicationYear") {
    return yearOnly(option?.term || option?.label || option?.raw?.label);
  }
  return rawFacetValueLabel(option);
}

function rawFacetFilterValue(facet = {}, option = {}) {
  const facetName = text(facet.name || option.key);

  if (facetName === "publicationYear") {
    const year = yearOnly(option?.term || option?.label || option?.raw?.label || option?.facetFilter);
    return year ? `customPublicationYear:${year}` : "";
  }

  const existing = text(option.facetFilter);
  if (existing) return existing;

  const term = text(option.term || option.value || option.id || option.label);

  if (facetName && term) return `${facetName}:${term}`;
  return "";
}

function isAvailableNowFilter(facet = {}, option = {}, filterValue = "") {
  return (
    text(facet.name) === "availableNow" &&
    (text(option.term) === "AT_THE_LIBRARY" || text(filterValue) === "availableNow:AT_THE_LIBRARY")
  );
}

function readBooleanQuery(value) {
  const normalized = text(Array.isArray(value) ? value[0] : value).toLowerCase();
  return normalized === "true" || normalized === "1";
}

function parseSearchStateFromPath(asPath = "") {
  const queryString = String(asPath).split("?")[1] || "";
  const params = new URLSearchParams(queryString);

  const rawFilters = expandFacetSelections(params.getAll("facetFilter"));
  const rawTermFilters = params.getAll("termFilter").map(text).filter(Boolean);
  const availableFromFacet = rawFilters.includes("availableNow:AT_THE_LIBRARY");
  const availableFromQuery = readBooleanQuery(params.get("filterAvailableTitles"));

  return {
    q: params.get("term") || "",
    nextSearchRequested: params.has("perspectiveId"),
    nextPage: Math.max(Number(params.get("page") || 1) || 1, 1),
    nextPerspectiveId: params.get("perspectiveId") || DEFAULT_PERSPECTIVE_ID,
    nextSearchScope: params.get("searchScope") || DEFAULT_SCOPE,
    nextSort: params.get("sort") || DEFAULT_SORT,
    nextFacetFilters: rawFilters.filter((filter) => filter !== "availableNow:AT_THE_LIBRARY"),
    nextTermFilters: rawTermFilters,
    nextFilterAvailableTitles: availableFromQuery || availableFromFacet,
  };
}

function itemTitle(item = {}) {
  const mainTitle = text(
    item.mainTitle ||
    item.title ||
    item.childTitleList?.[0]?.childTitle
  );

  const volumeTitle = [
    text(item.volume),
    text(item.volumeTitle),
  ].filter(Boolean).join(", ");

  return [
    mainTitle,
    text(item.subtitle),
    volumeTitle,
  ].filter(Boolean).join(" / ");
}
function selectedSet(filters = []) {
  return new Set(asArray(filters).map(text).filter(Boolean));
}

function itemCover(item = {}) {
  return text(
    item.imageUrls?.medium ||
    item.imageUrls?.small ||
    item.imageUrls?.large
  );
}

function itemLanguage(item = {}) {
  return asArray(item.language)
    .map((entry) => text(entry?.description || entry?.code))
    .filter(Boolean)
    .join(", ");
}

function itemGenre(item = {}) {
  return asArray(item.genre)
    .map((entry) => text(entry?.description))
    .filter(Boolean)
    .join(", ");
}

function downloadFile(filename, contents, mimeType) {
  try {
    const blob = new Blob([contents], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.setAttribute("download", filename);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download mislukt", error);
    window.alert("Download mislukt. Controleer de console.");
  }
}

function downloadCsv(filename, csv) {
  downloadFile(filename, csv, "text/csv;charset=utf-8;");
}

export default function OclcSearchPage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [failedCalls, setFailedCalls] = useState([]);
  const [facetLabels, setFacetLabels] = useState({});
  const [expandedFacets, setExpandedFacets] = useState({});
  const [openFilterCards, setOpenFilterCards] = useState({ perspective: true });

  const [perspectiveId, setPerspectiveId] = useState(DEFAULT_PERSPECTIVE_ID);
  const [searchScope, setSearchScope] = useState(DEFAULT_SCOPE);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [facetFilters, setFacetFilters] = useState([]);
  const [termFilters, setTermFilters] = useState([]);
  const [filterAvailableTitles, setFilterAvailableTitles] = useState(false);

  const page = Number(router.query.page || 1);

  useEffect(() => {
    if (!router.isReady) return;

    const urlState = parseSearchStateFromPath(router.asPath);

    setQuery(isCollectionTerm(urlState.q) ? "" : urlState.q);
    setFacetLabels(readFacetLabels());
    setPerspectiveId(urlState.nextPerspectiveId);
    setSearchScope(urlState.nextSearchScope);
    setSort(urlState.nextSort);
    setFacetFilters(urlState.nextFacetFilters);
    setTermFilters(urlState.nextTermFilters);
    setFilterAvailableTitles(urlState.nextFilterAvailableTitles);

    return runSearchFromState(urlState);
  }, [router.isReady, router.asPath]);

  useEffect(() => {
    const q = query.trim();

    if (q.length < 2 || isCollectionTerm(q)) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/oclc-search?term=${encodeURIComponent(q)}&suggest=1&searchScope=${encodeURIComponent(searchScope)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((json) => {
          const values = asArray(json?.suggestions)
            .map((item) =>
              typeof item === "string"
                ? item
                : text(item?.text || item?.value || item?.suggestion || item?.term || item?.title)
            )
            .filter(Boolean);

          if (!controller.signal.aborted) setSuggestions(values);
        })
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]); });
    }, 250);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchScope]);

  function currentSearchState() {
    const urlState = parseSearchStateFromPath(router.asPath);

    return {
      ...urlState,
      q: urlState.q,
      nextPerspectiveId: perspectiveId || urlState.nextPerspectiveId || DEFAULT_PERSPECTIVE_ID,
      nextSearchScope: searchScope || urlState.nextSearchScope || DEFAULT_SCOPE,
      nextSort: sort || urlState.nextSort || DEFAULT_SORT,
      nextFacetFilters: facetFilters,
      nextTermFilters: termFilters,
      nextFilterAvailableTitles: filterAvailableTitles,
    };
  }

  function buildUrl(state) {
    const backend = asArray(data?.perspectives).find((entry) => String(entry.id) === String(state.nextPerspectiveId))?.backend;
    return buildSearchUrl(state, { backend });
  }
  function buildApiUrl(state) {
    const backend = asArray(data?.perspectives).find((entry) => String(entry.id) === String(state.nextPerspectiveId))?.backend;
    return buildSearchUrl(state, { api: true, limit: DEFAULT_LIMIT, backend });
  }

  function navigateSearch(nextValues = {}) {
    const nextState = {
      ...currentSearchState(),
      ...nextValues,
    };

    router.push(buildUrl(nextState), undefined, { shallow: true });
  }

  function runSearchFromState(searchState) {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setFailedCalls([]);
    // Old results and counts must not appear under new criteria.
    setData((previous) => ({ perspectives: asArray(previous?.perspectives).map((entry) => ({ ...entry, count: null, countUrl: "", countError: "" })) }));
    setShowSuggestions(false);
    fetch(buildApiUrl(searchState), { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json) {
          if (!controller.signal.aborted) setFailedCalls(asArray(json?.debug?.calls));
          throw new Error(json?.error || `Request failed with status ${response.status}`);
        }
        return json;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        setData(json);
        const labelEntries = asArray(json?.facets).flatMap((facet) => asArray(facet.values).map((option) => [rawFacetFilterValue(facet, option), rawFacetValueLabel(option)]));
        setFacetLabels(rememberFacetLabels(json?.selectedPerspectiveId, labelEntries));
        setPerspectiveId(text(json?.selectedPerspectiveId || searchState.nextPerspectiveId));
        setSearchScope(text(json?.selectedSearchScope || searchState.nextSearchScope));
        setSort(text(json?.selectedSort || searchState.nextSort));
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message || "Onbekende fout"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }

  function submit(event) {
    event.preventDefault();
    navigateSearch({ q: query, nextSearchRequested: true, nextPage: 1, nextTermFilters: [] });
  }

  function changePerspective(nextPerspectiveId) {
    if (String(nextPerspectiveId) === String(perspectiveId)) return;
    navigateSearch(searchStateForPerspective(currentSearchState(), nextPerspectiveId));
  }

  function changeScope(nextScope) {
    navigateSearch({
      nextSearchRequested: true,
      nextPage: 1,
      nextSearchScope: nextScope,
      nextFacetFilters: [],
      nextTermFilters: [],
      nextFilterAvailableTitles: false,
    });
  }

  function changeSort(nextSort) {
    navigateSearch({
      nextPage: 1,
      nextSort,
    });
  }

  function toggleFacet(filterValue, options = {}) {
    if (options.isAvailableNow) {
      const nextAvailable = !filterAvailableTitles;
      setFilterAvailableTitles(nextAvailable);
      navigateSearch({
        nextPage: 1,
        nextFilterAvailableTitles: nextAvailable,
      });

      return;
    }

    const value = text(filterValue);
    if (!value) return;
    if (options.label) setFacetLabels(rememberFacetLabels(perspectiveId, [[value, options.label]]));

    const exists = facetFilters.includes(value);
    const nextFilters = exists ? facetFilters.filter((item) => item !== value) : [...facetFilters, value];

    setFacetFilters(nextFilters);
    navigateSearch({
      nextPage: 1,
      nextFacetFilters: nextFilters,
    });
  }

  function removeTermFilter(filterValue) {
    const value = text(filterValue);
    const nextFilters = termFilters.filter((item) => item !== value);
    setTermFilters(nextFilters);
    navigateSearch({
      nextPage: 1,
      nextTermFilters: nextFilters,
    });
  }

  function toggleFacetExpansion(facetName) {
    setExpandedFacets((current) => ({
      ...current,
      [facetName]: !current[facetName],
    }));
  }

  function toggleFilterCard(filterName) {
    setOpenFilterCards((current) => ({
      ...current,
      [filterName]: !current[filterName],
    }));
  }

  const perspectives = asArray(data?.perspectives);
  const selectedPerspective =
    perspectives.find((item) => String(item.id) === String(perspectiveId)) || data?.selectedPerspective || perspectives[0] || null;
  const searchScopes = asArray(selectedPerspective?.searchScopes || data?.searchScopes);
  const sortkeys = asArray(data?.sortkeys?.length ? data.sortkeys : selectedPerspective?.sortings);
  const facets = asArray(data?.facets);
  const configuredFacets = useMemo(() => OCLC_SEARCH_FACET_DEFINITIONS
    .map((definition) => ({
      definition,
      facet: facets.find((facet) => findOclcSearchFacetDefinition(facet)?.name === definition.name),
    }))
    .filter(({ facet }) => Boolean(facet)), [facets]);
  const implementedFacets = configuredFacets.filter(({ definition }) => definition.obaIst === "WEL");
  const additionalFacets = configuredFacets.filter(({ definition }) => definition.obaIst === "NIET");
  const labeledPerspectives = perspectives.filter((perspective) => text(perspective?.label));
  const labeledSearchScopes = searchScopes.filter((scope) => text(scope?.label));
  const labeledSortkeys = sortkeys.filter((sorting) => text(sorting?.label));
  const items = asArray(data?.items);
  const calls = failedCalls.length ? failedCalls : asArray(data?.debug?.calls);
  const selectedFilters = selectedSet(facetFilters);
  const activeFilterChips = [
    ...facetFilters.map((value) => ({
      key: `facet-${value}`,
      label: activeFilterLabel(value, facets, facetLabels, perspectiveId),
      remove: () => toggleFacet(value),
    })),
    ...termFilters.map((value) => ({
      key: `term-${value}`,
      label: activeFilterLabel(value, facets, facetLabels, perspectiveId),
      remove: () => removeTermFilter(value),
    })),
    ...(filterAvailableTitles ? [{
      key: "availability",
      label: "Nu aanwezig",
      remove: () => toggleFacet("availableNow:AT_THE_LIBRARY", { isAvailableNow: true }),
    }] : []),
  ].filter((chip) => chip.label);

  const documentationData = useMemo(() => ({ ...data, debug: { calls: failedCalls.length ? failedCalls : asArray(data?.debug?.calls) } }), [data, failedCalls]);
  const usedFieldRows = useMemo(() => buildOclcUsedFieldRows(documentationData), [documentationData]);
  const filterRows = useMemo(() => buildOclcFilterRows(documentationData), [documentationData]);
  const allFieldRows = useMemo(() => buildOclcAllFieldRows(data), [data]);
  const allOclc = useMemo(
    () => ({
      perspectiveResponse: data?.raw?.perspectiveResponse || null,
      searchResponse: data?.raw?.searchResponse || null,
    }),
    [data]
  );

  const resultCount = data?.pagination?.total == null ? "" : Number(data.pagination.total).toLocaleString("nl-NL");
  const appliedTerm = parseSearchStateFromPath(router.asPath).q;
  const activeCriteriaLabel = (isCollectionTerm(appliedTerm) ? "" : text(appliedTerm)) || readableFilterCriteria(
    data?.selectedFacetFilters || facetFilters,
    data?.selectedTermFilters || termFilters,
    data?.selectedFilterAvailableTitles || filterAvailableTitles
  );
  const currentPage = Number(data?.pagination?.page || page || 1);
  const hasSearchCriteria = Boolean(
    parseSearchStateFromPath(router.asPath).nextSearchRequested || text(appliedTerm) || facetFilters.length || termFilters.length || filterAvailableTitles
  );
  const hasCompletedSearch = Boolean(
    data?.selectedFullCollection ||
    text(data?.query) ||
    asArray(data?.selectedFacetFilters).length ||
    asArray(data?.selectedTermFilters).length ||
    data?.selectedFilterAvailableTitles
  );
  const hasNextPage = Number(data?.pagination?.offset || 0) + Number(data?.pagination?.limit || DEFAULT_LIMIT) < Number(data?.pagination?.total || 0);

  function renderFacetCard({ facet, definition }) {
    const key = text(facet.name || facet.labelKey || facet.id || definition.name);
    const filterCardKey = `facet-${definition.name}`;
    const isOpen = Boolean(openFilterCards[filterCardKey]);
    const expanded = Boolean(expandedFacets[key]);
    const labeledValues = asArray(facet.values || facet.filterList)
      .filter((option) => displayedFacetValueLabel(definition, option));
    const visibleValues = expanded
      ? labeledValues
      : labeledValues.slice(0, DEFAULT_VISIBLE_FACET_VALUES);

    return (
      <div className={isOpen ? "filter-card filter-card-open" : "filter-card"} key={key}>
        <button
          type="button"
          className="filter-card-title"
          aria-expanded={isOpen}
          onClick={() => toggleFilterCard(filterCardKey)}
        >
          {rawFacetTitle(facet)}
        </button>

        {isOpen && visibleValues.length ? (
          <div className="filter-options">
            {visibleValues.map((option) => {
              const valueLabel = displayedFacetValueLabel(definition, option);
              const filterValue = rawFacetFilterValue(facet, option);
              const isAvailableNow = isAvailableNowFilter(facet, option, filterValue);
              const checked = isAvailableNow ? filterAvailableTitles : selectedFilters.has(filterValue);

              return (
                <button
                  key={`${key}-${filterValue}-${valueLabel}`}
                  type="button"
                  className={checked ? "filter-checkbox active" : "filter-checkbox"}
                  aria-pressed={checked}
                  onClick={() => toggleFacet(filterValue, { isAvailableNow, label: valueLabel })}
                >
                  <span className="checkbox-dot" />
                  <span className="filter-label">{valueLabel}</span>
                  <span className="filter-count">{option.count == null ? "—" : Number(option.count).toLocaleString("nl-NL")}</span>
                </button>
              );
            })}

            {labeledValues.length > DEFAULT_VISIBLE_FACET_VALUES ? (
              <button
                type="button"
                className="filter-checkbox"
                onClick={() => toggleFacetExpansion(key)}
              >
                <span />
                <span className="filter-label">{expanded ? "Minder" : `Meer (${labeledValues.length})`}</span>
                <span />
              </button>
            ) : null}
          </div>
        ) : isOpen ? (
          <div className="filter-empty">Geen waarden met een OCLC-label</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="header-image">
        <img src="/header.JPG" alt="Header" />
      </div>

      <div className="container search-page oba-search-page">
        <nav className="oba-breadcrumbs" aria-label="Broodkruimelpad">
          <button type="button" className="oba-chip" onClick={() => router.back()}>
            ← Terug
          </button>
          <span className="oba-chip oba-chip-dark">⌂</span>
          <span className="oba-chip">OCLC zoeken</span>
        </nav>

        <section className="oba-search-top">
          {labeledPerspectives.length ? (
            <fieldset className="search-perspective-selector">
              <legend>Zoek in</legend>
              <div className="search-perspective-options">
                {labeledPerspectives.map((perspective) => (
                  <label className="search-perspective-option" key={perspective.id}>
                    <input
                      type="radio"
                      name="search-perspective"
                      value={perspective.id}
                      checked={String(perspective.id) === String(perspectiveId)}
                      onChange={() => changePerspective(String(perspective.id))}
                    />
                    <span>{perspective.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <form className="oba-search-form" onSubmit={submit}>
            <div className="search-input-wrap">
              <input
                className="oba-search-input"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Waar ben je naar op zoek?"
                aria-label="Zoeken"
              />

              {query ? (
                <button
                  type="button"
                  className="oba-search-clear"
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                    navigateSearch({
                      q: "",
                      nextSearchRequested: false,
                      nextPage: 1,
                      nextFacetFilters: [],
                      nextTermFilters: [],
                      nextFilterAvailableTitles: false,
                    });
                  }}
                >
                  ×
                </button>
              ) : null}

              {showSuggestions && suggestions.length ? (
                <div className="suggestion-box">
                  {suggestions.slice(0, 8).map((suggestion, index) => (
                    <button
                      key={`${suggestion}-${index}`}
                      type="button"
                      className="suggestion-item"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setQuery(suggestion);
                        navigateSearch({
                          q: suggestion,
                          nextSearchRequested: true,
                          nextPage: 1,
                          nextFacetFilters: [],
                          nextTermFilters: [],
                          nextFilterAvailableTitles: false,
                        });
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button type="submit" className="oba-search-submit" aria-label="Zoeken">
              →
            </button>
          </form>

          <Link
            href={buildUrl({
              ...currentSearchState(),
              q: "",
              nextSearchRequested: true,
              nextPage: 1,
              nextSearchScope: DEFAULT_SCOPE,
              nextSort: DEFAULT_SORT,
              nextFacetFilters: [],
              nextTermFilters: [],
              nextFilterAvailableTitles: false,
            })}
            style={{ color: "inherit", display: "inline-block", marginTop: "12px", textDecoration: "underline" }}
          >
            Alles in de collectie
          </Link>

        </section>

        {error ? <div className="search-error">Fout: {error}</div> : null}
        {loading ? <div className="search-loading">Zoeken...</div> : null}

        <section className="oba-search-layout">
          <aside className="oba-filter-panel">
            {hasCompletedSearch && labeledPerspectives.length ? (
              <div className={openFilterCards.perspective ? "filter-card filter-card-open" : "filter-card"}>
                <button
                  type="button"
                  className="filter-card-title"
                  aria-expanded={Boolean(openFilterCards.perspective)}
                  onClick={() => toggleFilterCard("perspective")}
                >
                  Zoeken in
                </button>

                {openFilterCards.perspective ? (
                  <div className="filter-options">
                    {labeledPerspectives.map((perspective) => (
                      <button
                        key={perspective.id}
                        type="button"
                        className={String(perspective.id) === String(perspectiveId) ? "filter-radio active" : "filter-radio"}
                        onClick={() => changePerspective(String(perspective.id))}
                      >
                        <span className="radio-dot" />
                        <span className="filter-label">{perspective.label}</span>
                        {perspective.count !== null && perspective.count !== undefined ? (
                          <span className="filter-count">
                            {Number(perspective.count).toLocaleString("nl-NL")}
                          </span>
                        ) : perspective.countError ? <span className="filter-count" title={perspective.countError} aria-label="Aantal niet beschikbaar">—</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {implementedFacets.map(renderFacetCard)}

            {hasCompletedSearch ? (
              <>
                <div className="filter-subsection-title">Niet geïmplementeerde filters</div>

                {labeledSearchScopes.length ? (
                  <div className={openFilterCards.searchScope ? "filter-card filter-card-open" : "filter-card"}>
                    <button
                      type="button"
                      className="filter-card-title"
                      aria-expanded={Boolean(openFilterCards.searchScope)}
                      onClick={() => toggleFilterCard("searchScope")}
                    >
                      Zoeken op
                    </button>

                    {openFilterCards.searchScope ? <div className="filter-options">
                      {labeledSearchScopes.map((scope) => {
                        const scopeValue = text(scope.value || scope.id);

                        return (
                          <button
                            key={scope.id || scopeValue}
                            type="button"
                            className={String(scopeValue) === String(searchScope) ? "filter-radio active" : "filter-radio"}
                            onClick={() => changeScope(scopeValue)}
                          >
                            <span className="radio-dot" />
                            <span>{scope.label}</span>
                          </button>
                        );
                      })}
                    </div> : null}
                  </div>
                ) : null}

                {additionalFacets.map(renderFacetCard)}
              </>
            ) : null}
          </aside>

          <main className="oba-results-panel">
            {hasSearchCriteria ? (
              <div className="oba-results-heading">
                <div>
                  <h1>
                    {data?.selectedFullCollection || ((!appliedTerm || isCollectionTerm(appliedTerm)) && !facetFilters.length && !termFilters.length && !filterAvailableTitles)
                      ? "Alles in de collectie"
                      : activeCriteriaLabel
                        ? `'${activeCriteriaLabel}'`
                        : "Zoekresultaten"} in {text(selectedPerspective?.label || selectedPerspective?.labelText) || "OCLC collectie"}
                  </h1>
                  {activeFilterChips.length ? (
                    <div className="oba-active-filters" aria-label="Actieve filters">
                      {activeFilterChips.map((chip) => (
                        <button
                          type="button"
                          className="oba-active-filter"
                          key={chip.key}
                          onClick={chip.remove}
                          aria-label={`Verwijder filter ${chip.label}`}
                        >
                          <span>{chip.label}</span>
                          <span aria-hidden="true">×</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {resultCount !== "" && !loading && !error ? <div className="oba-result-count">{resultCount} resultaten</div> : null}
                  {isNbcPerspective(perspectiveId, selectedPerspective?.backend) && activeFilterChips.length ? <p>Alle geselecteerde filters gelden tegelijk (EN).</p> : null}
                </div>

                <label className="oba-sort">
                  <span>Sorteren op:</span>
                  <select
                    value={labeledSortkeys.some((sorting) => String(sorting.id) === String(sort)) ? sort : ""}
                    onChange={(event) => changeSort(event.target.value)}
                  >
                    {labeledSortkeys.length ? (
                      labeledSortkeys.map((sorting) => (
                        <option key={sorting.id} value={sorting.id}>
                          {rawSortLabel(sorting)}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>Geen OCLC-labels beschikbaar</option>
                    )}
                  </select>
                </label>
              </div>
            ) : null}

            {hasCompletedSearch && !loading && !error ? (
              <section className="oba-result-list">
                {items.length ? (
                  items.map((item, index) => {
                    const title = itemTitle(item);
                    const image = itemCover(item);
                    const detailHref = item.detailHref || "#";
                    const author = text(item.author?.description);
                    const language = itemLanguage(item);
                    const year = text(item.publicationYear);
                    const media = text(item.media?.description || item.mediumGroup?.description);
                    const summary = text(item.contents || item.contentsSchoolWise);
                    const genre = itemGenre(item);
                    const subject = text(item.subjectPim?.description);

                    return (
                      <article className="oba-result-item" key={`${item.id || item.frbrId}-${index}`}>
                        {item.detailHref ? (
                          <Link href={detailHref} className="oba-result-cover-link">
                            {image ? (
                              <img src={image} alt={title || "Cover"} className="oba-result-cover" />
                            ) : (
                              <div className="oba-result-cover empty-cover">Geen cover</div>
                            )}
                          </Link>
                        ) : image ? (
                          <div className="oba-result-cover-link">
                            <img src={image} alt={title || "Cover"} className="oba-result-cover" />
                          </div>
                        ) : (
                          <div className="oba-result-cover empty-cover">Geen cover</div>
                        )}

                        <div className="oba-result-body">
                          {item.detailHref ? (
                            <Link href={detailHref} className="oba-result-title">
                              {title || "Onbekende titel"}
                            </Link>
                          ) : (
                            <span className="oba-result-title">{title || "Onbekende titel"}</span>
                          )}

                          {author ? <div className="oba-result-author">{author}</div> : null}
                          {media ? <div className="oba-result-type">{media}</div> : null}

                          <div className="oba-result-meta">
                            {[language, year, genre, subject].filter(Boolean).join(" | ")}
                          </div>

                          {summary ? <p className="oba-result-summary">{summary}</p> : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="info-card">Geen resultaten</div>
                )}
              </section>
            ) : null}

            {hasCompletedSearch && !loading && !error ? (
              <section className="pagination-row">
                <button
                  type="button"
                  className="tab-button"
                  disabled={currentPage <= 1}
                  onClick={() => navigateSearch({ nextPage: currentPage - 1 })}
                >
                  vorige
                </button>

                <button
                  type="button"
                  className="tab-button active"
                  disabled={!hasNextPage}
                  onClick={() => navigateSearch({ nextPage: currentPage + 1 })}
                >
                  volgende
                </button>
              </section>
            ) : null}
          </main>
        </section>

        <section className="debug-section">
          <div className="download-buttons-row">
            <button
              type="button"
              className="tab-button"
              onClick={() => downloadCsv(
                `oclc-search-${query || "zoekopdracht"}-gebruikte-velden.csv`,
                toOclcUsedFieldsCsv(usedFieldRows)
              )}
            >
              Gebruikte velden OCLC CSV
            </button>
            <button
              type="button"
              className="tab-button"
              onClick={() => downloadCsv(
                `oclc-search-${query || "zoekopdracht"}-filters.csv`,
                toOclcFilterCsv(filterRows)
              )}
            >
              Filters OCLC CSV
            </button>
            <button
              type="button"
              className="tab-button"
              onClick={() => downloadCsv(
                `oclc-search-${query || "zoekopdracht"}-alle-velden.csv`,
                toOclcAllFieldsCsv(allFieldRows)
              )}
            >
              Alle velden OCLC CSV
            </button>
            <button
              type="button"
              className="tab-button"
              onClick={() =>
                downloadFile(
                  `oclc-search-${query || "zoekopdracht"}.json`,
                  pretty(allOclc),
                  "application/json;charset=utf-8;"
                )
              }
            >
              Download OCLC JSON
            </button>
          </div>

          <details className="debug-block">
            <summary>Alles OCLC</summary>
            <div className="debug-content">
              <pre>{pretty(allOclc)}</pre>
            </div>
          </details>

          <details className="debug-block">
            <summary>OCLC API calls</summary>
            <div className="debug-content">
              {calls.length ? (
                calls.map((call, index) => (
                  <details className="debug-call" key={`${call?.url || "call"}-${index}`}>
                    <summary>
                      {call?.url || "Onbekende call"} | {call?.status || "?"}
                    </summary>
                    <pre>{pretty(call?.body ?? call)}</pre>
                  </details>
                ))
              ) : (
                <pre>Geen calls beschikbaar</pre>
              )}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
