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

const pretty = (value) => JSON.stringify(value, null, 2);

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const DEFAULT_PERSPECTIVE_ID = "3682";
const DEFAULT_SCOPE = "title";
const DEFAULT_SORT = "2910";
const DEFAULT_LIMIT = 20;
const DEFAULT_VISIBLE_FACET_VALUES = 15;

function rawSortLabel(sort = {}) {
  return text(sort.label);
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
  return text(option?.raw?.label);
}

function displayedFacetValueLabel(definition = {}, option = {}) {
  if (definition.name === "availableNow") return "Nu aanwezig";
  return rawFacetValueLabel(option);
}

function rawFacetFilterValue(facet = {}, option = {}) {
  const existing = text(option.facetFilter);
  if (existing) return existing;

  const facetName = text(facet.name || option.key);
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

  const rawFilters = params.getAll("facetFilter").map(text).filter(Boolean);
  const rawTermFilters = params.getAll("termFilter").map(text).filter(Boolean);
  const availableFromFacet = rawFilters.includes("availableNow:AT_THE_LIBRARY");
  const availableFromQuery = readBooleanQuery(params.get("filterAvailableTitles"));

  return {
    q: params.get("q") || "",
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
  return text(item.title || item.mainTitle || item.childTitleList?.[0]?.childTitle);
}

function itemCover(item = {}) {
  return text(item.imageUrls?.medium || item.imageUrls?.small || item.imageUrls?.large);
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

function selectedSet(filters = []) {
  return new Set(asArray(filters).map(text).filter(Boolean));
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

/**
 * ALL search page.
 * Presents OCLC search data directly as a visual result list, source JSON, API calls and downloads.
 */
export default function OclcSearchPage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedFacets, setExpandedFacets] = useState({});
  const [openFilterCards, setOpenFilterCards] = useState({});

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

    setQuery(urlState.q);
    setPerspectiveId(urlState.nextPerspectiveId);
    setSearchScope(urlState.nextSearchScope);
    setSort(urlState.nextSort);
    setFacetFilters(urlState.nextFacetFilters);
    setTermFilters(urlState.nextTermFilters);
    setFilterAvailableTitles(urlState.nextFilterAvailableTitles);

    runSearchFromState(urlState);
  }, [router.isReady, router.asPath]);

  useEffect(() => {
    const q = query.trim();

    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/oclc-search?q=${encodeURIComponent(q)}&suggest=1&searchScope=${encodeURIComponent(searchScope)}`)
        .then((response) => response.json())
        .then((json) => {
          const values = asArray(json?.suggestions)
            .map((item) =>
              typeof item === "string"
                ? item
                : text(item?.text || item?.value || item?.suggestion || item?.term || item?.title)
            )
            .filter(Boolean);

          setSuggestions(values);
        })
        .catch(() => setSuggestions([]));
    }, 250);

    return () => clearTimeout(timer);
  }, [query, searchScope]);

  function currentSearchState() {
    const urlState = parseSearchStateFromPath(router.asPath);

    return {
      ...urlState,
      q: query,
      nextPerspectiveId: perspectiveId || urlState.nextPerspectiveId || DEFAULT_PERSPECTIVE_ID,
      nextSearchScope: searchScope || urlState.nextSearchScope || DEFAULT_SCOPE,
      nextSort: sort || urlState.nextSort || DEFAULT_SORT,
      nextFacetFilters: facetFilters,
      nextTermFilters: termFilters,
      nextFilterAvailableTitles: filterAvailableTitles,
    };
  }

  function buildUrl({
    q,
    nextPage,
    nextPerspectiveId,
    nextSearchScope,
    nextSort,
    nextFacetFilters,
    nextTermFilters,
    nextFilterAvailableTitles,
  }) {
    const params = new URLSearchParams();

    if (text(q)) params.set("q", text(q));
    params.set("page", String(nextPage || 1));
    params.set("perspectiveId", String(nextPerspectiveId || DEFAULT_PERSPECTIVE_ID));
    params.set("searchScope", String(nextSearchScope || DEFAULT_SCOPE));
    params.set("sort", String(nextSort || DEFAULT_SORT));

    asArray(nextFacetFilters).forEach((filter) => {
      if (text(filter)) params.append("facetFilter", text(filter));
    });

    asArray(nextTermFilters).forEach((filter) => {
      if (text(filter)) params.append("termFilter", text(filter));
    });

    if (nextFilterAvailableTitles) {
      params.set("filterAvailableTitles", "true");
    }

    return `/oclc-search?${params.toString()}`;
  }

  function buildApiUrl({
    q,
    nextPage,
    nextPerspectiveId,
    nextSearchScope,
    nextSort,
    nextFacetFilters,
    nextTermFilters,
    nextFilterAvailableTitles,
  }) {
    const params = new URLSearchParams();

    if (text(q)) params.set("q", text(q));
    params.set("page", String(nextPage || 1));
    params.set("limit", String(DEFAULT_LIMIT));
    params.set("perspectiveId", String(nextPerspectiveId || DEFAULT_PERSPECTIVE_ID));
    if (String(nextSearchScope || DEFAULT_SCOPE) !== DEFAULT_SCOPE) {
      params.set("searchScope", String(nextSearchScope));
    }
    if (String(nextSort || DEFAULT_SORT) !== DEFAULT_SORT) {
      params.set("sort", String(nextSort));
    }
    params.set("filterAvailableTitles", nextFilterAvailableTitles ? "true" : "false");

    asArray(nextFacetFilters).forEach((filter) => {
      if (text(filter)) params.append("facetFilter", text(filter));
    });

    asArray(nextTermFilters).forEach((filter) => {
      if (text(filter)) params.append("termFilter", text(filter));
    });

    return `/api/oclc-search?${params.toString()}`;
  }

  function navigateSearch(nextValues = {}) {
    const nextState = {
      ...currentSearchState(),
      ...nextValues,
    };

    router.push(buildUrl(nextState), undefined, { shallow: true });
  }

  function runSearchFromState(searchState) {
    setLoading(true);
    setError("");
    setShowSuggestions(false);

    fetch(buildApiUrl(searchState))
      .then(async (response) => {
        const json = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(json?.error || `Request failed with status ${response.status}`);
        }

        return json;
      })
      .then((json) => {
        setData(json);
        setPerspectiveId(text(json?.selectedPerspectiveId || searchState.nextPerspectiveId));
        setSearchScope(text(json?.selectedSearchScope || searchState.nextSearchScope));
        setSort(text(json?.selectedSort || searchState.nextSort));
      })
      .catch((err) => {
        setError(err.message || "Onbekende fout");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function submit(event) {
    event.preventDefault();
    navigateSearch({ q: query, nextPage: 1, nextTermFilters: [] });
  }

  function changePerspective(nextPerspectiveId) {
    navigateSearch({
      q: query,
      nextPage: 1,
      nextPerspectiveId,
      nextSearchScope: DEFAULT_SCOPE,
      nextSort: DEFAULT_SORT,
      nextFacetFilters: [],
      nextTermFilters: [],
      nextFilterAvailableTitles: false,
    });
  }

  function changeScope(nextScope) {
    navigateSearch({
      q: query,
      nextPage: 1,
      nextSearchScope: nextScope,
      nextFacetFilters: [],
      nextTermFilters: [],
      nextFilterAvailableTitles: false,
    });
  }

  function changeSort(nextSort) {
    navigateSearch({
      q: query,
      nextPage: 1,
      nextSort,
    });
  }

  function toggleFacet(filterValue, options = {}) {
    if (options.isAvailableNow) {
      const nextAvailable = !filterAvailableTitles;
      setFilterAvailableTitles(nextAvailable);
      navigateSearch({
        q: query,
        nextPage: 1,
        nextFilterAvailableTitles: nextAvailable,
      });

      return;
    }

    const value = text(filterValue);
    if (!value) return;

    const exists = facetFilters.includes(value);
    const nextFilters = exists ? facetFilters.filter((item) => item !== value) : [...facetFilters, value];

    setFacetFilters(nextFilters);
    navigateSearch({
      q: query,
      nextPage: 1,
      nextFacetFilters: nextFilters,
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
  const calls = asArray(data?.debug?.calls);
  const selectedFilters = selectedSet(facetFilters);

  const usedFieldRows = useMemo(() => buildOclcUsedFieldRows(data), [data]);
  const filterRows = useMemo(() => buildOclcFilterRows(data), [data]);
  const allFieldRows = useMemo(() => buildOclcAllFieldRows(data), [data]);
  const allOclc = useMemo(
    () => ({
      perspectiveResponse: data?.raw?.perspectiveResponse || null,
      titlesummaryResponse: data?.raw?.searchResponse || null,
    }),
    [data]
  );

  const resultCount = Number(data?.pagination?.total || 0).toLocaleString("nl-NL");
  const currentPage = Number(data?.pagination?.page || page || 1);
  const hasQuery = Boolean(text(query));
  const hasCompletedSearch = Boolean(text(data?.query));
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
                  onClick={() => toggleFacet(filterValue, { isAvailableNow })}
                >
                  <span className="checkbox-dot" />
                  <span className="filter-label">{valueLabel}</span>
                  <span className="filter-count">{Number(option.count || 0).toLocaleString("nl-NL")}</span>
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
                placeholder="Waar ben je naar op zoek? (*.* voor volledige collectie)"
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

        </section>

        {error ? <div className="search-error">Fout: {error}</div> : null}
        {loading ? <div className="search-loading">Zoeken...</div> : null}

        <section className="oba-search-layout">
          <aside className="oba-filter-panel">
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
            {hasQuery ? (
              <div className="oba-results-heading">
                <div>
                  <h1>
                    '{text(data?.query) || query}' in {text(selectedPerspective?.label || selectedPerspective?.labelText) || "OCLC collectie"}
                  </h1>
                  <div className="oba-result-count">{resultCount} resultaten</div>
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

            {hasQuery ? (
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
                        ) : (
                          <div className="oba-result-cover empty-cover">Geen detail-id</div>
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

            {hasQuery ? (
              <section className="pagination-row">
                <button
                  type="button"
                  className="tab-button"
                  disabled={currentPage <= 1}
                  onClick={() => navigateSearch({ q: query, nextPage: currentPage - 1 })}
                >
                  vorige
                </button>

                <button
                  type="button"
                  className="tab-button active"
                  disabled={!hasNextPage}
                  onClick={() => navigateSearch({ q: query, nextPage: currentPage + 1 })}
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
