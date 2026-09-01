import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { buildSearchMappingRows, toSearchMappingCsv } from "../utils/searchMappingRows";

// Pretty-print JSON for the visible debug panels.
const pretty = (value) => JSON.stringify(value, null, 2);

// Normalize OCLC fields that may be returned as either a single object or an array.
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// Convert optional API values to safe display strings.
const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const SORT_LABELS = {
  "2910": "relevantie",
  "2911": "populariteit",
  "2912": "jaar",
  "2913": "auteur",
  "2914": "titel",
};

const DEFAULT_PERSPECTIVE_ID = "3682";
const DEFAULT_SCOPE = "title";
const DEFAULT_SORT = "2910";

function scopeValue(scope = {}) {
  const value = text(scope.labelText || scope.labelKey || scope.id || DEFAULT_SCOPE)
    .toLowerCase()
    .replace(/^search[_ -]?in[_ -]?/, "");
  const aliases = {
    alles: "anything",
    titel: "title",
    auteur: "author",
    onderwerp: "subject",
    serie: "series",
    reeks: "series",
  };

  return aliases[value] || value;
}

// Check whether a value is safe to use as a Wise/OCLC detail id.
function isNumericId(value) {
  return /^\d+$/.test(text(value));
}

// Resolve the detail id used by the visual result link.
function idForDetail(result = {}) {
  const detailPage = text(result?.["detail-page"]?._text);

  if (detailPage.startsWith("/oba-detail/")) {
    return decodeURIComponent(detailPage.replace("/oba-detail/", ""));
  }

  return text(result?.id?._attributes?.nativeid);
}

// Read the title from the mapped OBA search-contract object.
function resultTitle(result = {}) {
  return text(result?.titles?.title?._text || result?.titles?.["short-title"]?._text);
}

// Read the cover URL from the mapped OBA search-contract object.
function coverImage(result = {}) {
  return text(result?.coverimages?.coverimage?._text);
}

// Read mapped topical subjects for optional display in the result card.
function subjects(result = {}) {
  return asArray(result?.subjects?.["topical-subject"])
    .map((item) => text(item?._text))
    .filter(Boolean);
}

// Build a readable label for an OCLC perspective.
function perspectiveLabel(perspective = {}) {
  return text(perspective.labelText || perspective.labelKey || perspective.id);
}

// Translate known OCLC/Wise sort option ids to short Dutch UI labels.
function sortLabel(sort = {}) {
  return SORT_LABELS[String(sort.id)] || text(sort.labelText || sort.labelKey || sort.id);
}

// Extract facet groups for the left filter panel.
// OCLC titlesummary uses `facets[].filterList[]`; older experiments used other names.
function extractFacetGroups(searchResponse = {}, perspectives = [], selectedPerspectiveId = "") {
  const safeSearchResponse =
    searchResponse && typeof searchResponse === "object" ? searchResponse : {};

  const rawGroups =
    safeSearchResponse.facets ||
    safeSearchResponse.facet ||
    safeSearchResponse.filters ||
    safeSearchResponse.filter ||
    safeSearchResponse.refinements ||
    safeSearchResponse.refinement ||
    [];

  const groups = asArray(rawGroups)
    .map((group) => {
      const label = text(group.labelText || group.labelKey || group.name || group.field || group.id);
      const field = text(group.field || group.name || group.key || group.id || group.labelKey);

      const rawValues =
        group.filterList ||
        group.values ||
        group.value ||
        group.items ||
        group.options ||
        group.entries ||
        group.buckets ||
        [];

      const values = asArray(rawValues)
        .map((item) => ({
          label: text(item.labelText || item.label || item.name || item.term || item.value || item.key || item.id),
          value: text(item.term || item.value || item.key || item.id || item.name || item.label),
          count: item.count ?? item.total ?? item.numberOfResults ?? item.hits ?? "",
          facetFilter:
            text(item.facetFilter || item.filter || item.query) ||
            (field && text(item.term || item.value || item.key || item.id || item.name || item.label)
              ? `${field}:${text(item.term || item.value || item.key || item.id || item.name || item.label)}`
              : ""),
        }))
        .filter((item) => item.label || item.value);

      return { label, field, values };
    })
    .filter((group) => group.label || group.values.length);

  if (groups.length) return groups;

  const selectedPerspective =
    asArray(perspectives).find((item) => String(item.id) === String(selectedPerspectiveId)) ||
    asArray(perspectives)[0];

  return asArray(selectedPerspective?.facets)
    .map((facet) => ({
      label: text(facet.labelText || facet.labelKey || facet.id),
      field: text(facet.id || facet.labelKey),
      values: [],
    }))
    .filter((group) => group.label);
}

// IST search page.
// Purpose: visual A/B search results plus OCLC source evidence, API calls, mapped output and CSV download.
export default function SearchPage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [perspectiveId, setPerspectiveId] = useState(DEFAULT_PERSPECTIVE_ID);
  const [searchScope, setSearchScope] = useState(DEFAULT_SCOPE);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [facetFilters, setFacetFilters] = useState([]);

  const page = Number(router.query.page || 1);

  useEffect(() => {
    if (!router.isReady) return;

    const q = typeof router.query.q === "string" ? router.query.q : "";
    const p =
      typeof router.query.perspectiveId === "string"
        ? router.query.perspectiveId
        : DEFAULT_PERSPECTIVE_ID;
    const scope =
      typeof router.query.searchScope === "string" ? router.query.searchScope : DEFAULT_SCOPE;
    const sortValue = typeof router.query.sort === "string" ? router.query.sort : DEFAULT_SORT;
    const filters = asArray(router.query.facetFilter).map(text).filter(Boolean);

    setQuery(q);
    setPerspectiveId(p);
    setSearchScope(scope);
    setSort(sortValue);
    setFacetFilters(filters);

    runSearch({
      q,
      nextPage: page,
      nextPerspectiveId: p,
      nextSearchScope: scope,
      nextSort: sortValue,
      nextFacetFilters: filters,
      replaceUrl: false,
    });
  }, [router.isReady]);

  useEffect(() => {
    const q = query.trim();

    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`/api/oba-search?q=${encodeURIComponent(q)}&suggest=1&searchScope=${encodeURIComponent(searchScope)}`)
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

  // Build the browser URL for the current search state.
  function buildUrl({
    q,
    nextPage,
    nextPerspectiveId,
    nextSearchScope,
    nextSort,
    nextFacetFilters,
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

    return `/oba-search?${params.toString()}`;
  }

  // Build the internal IST search API URL.
  // This preserves the current UI state; endpoint behavior lives in /api/oba-search.
  function buildApiUrl({
    q,
    nextPage,
    nextPerspectiveId,
    nextSearchScope,
    nextSort,
    nextFacetFilters,
  }) {
    const params = new URLSearchParams();

    if (text(q)) params.set("q", text(q));
    params.set("page", String(nextPage || 1));
    params.set("limit", "20");
    params.set("perspectiveId", String(nextPerspectiveId || DEFAULT_PERSPECTIVE_ID));
    if (String(nextSearchScope || DEFAULT_SCOPE) !== DEFAULT_SCOPE) {
      params.set("searchScope", String(nextSearchScope));
    }
    if (String(nextSort || DEFAULT_SORT) !== DEFAULT_SORT) {
      params.set("sort", String(nextSort));
    }

    asArray(nextFacetFilters).forEach((filter) => {
      if (text(filter)) params.append("facetFilter", text(filter));
    });

    return `/api/oba-search?${params.toString()}`;
  }

  // Execute a search and optionally synchronize the browser URL.
  function runSearch({
    q = query,
    nextPage = 1,
    nextPerspectiveId = perspectiveId,
    nextSearchScope = searchScope,
    nextSort = sort,
    nextFacetFilters = facetFilters,
    replaceUrl = true,
  } = {}) {
    setLoading(true);
    setError("");
    setShowSuggestions(false);

    fetch(
      buildApiUrl({
        q,
        nextPage,
        nextPerspectiveId,
        nextSearchScope,
        nextSort,
        nextFacetFilters,
      })
    )
      .then(async (response) => {
        const json = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(json?.error || `Request failed with status ${response.status}`);
        }

        return json;
      })
      .then((json) => {
        setData(json);
        const resolvedPerspectiveId = text(json?.raw?.selectedPerspectiveId || nextPerspectiveId);
        const resolvedSearchScope = text(json?.raw?.selectedSearchScope || nextSearchScope);
        const resolvedSort = text(json?.raw?.selectedSort || nextSort);

        setPerspectiveId(resolvedPerspectiveId);
        setSearchScope(resolvedSearchScope);
        setSort(resolvedSort);

        if (replaceUrl) {
          router.replace(
            buildUrl({
              q,
              nextPage,
              nextPerspectiveId: resolvedPerspectiveId,
              nextSearchScope: resolvedSearchScope,
              nextSort: resolvedSort,
              nextFacetFilters,
            }),
            undefined,
            { shallow: true }
          );
        }
      })
      .catch((err) => {
        setError(err.message || "Onbekende fout");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  // Submit a new text search from the search box.
  function submit(event) {
    event.preventDefault();
    runSearch({ q: query, nextPage: 1 });
  }

  // Change OCLC perspective and clear active facets, because facets are perspective-specific.
  function changePerspective(nextPerspectiveId) {
    setPerspectiveId(nextPerspectiveId);
    setSearchScope(DEFAULT_SCOPE);
    setSort(DEFAULT_SORT);
    setFacetFilters([]);

    runSearch({
      q: query,
      nextPage: 1,
      nextPerspectiveId,
      nextSearchScope: DEFAULT_SCOPE,
      nextSort: DEFAULT_SORT,
      nextFacetFilters: [],
    });
  }

  // Apply the selected WISE sorting to the upstream titlesummary request.
  function changeSort(nextSort) {
    setSort(nextSort);

    runSearch({
      q: query,
      nextPage: 1,
      nextSort,
    });
  }

  // Toggle a facetFilter value exactly as OCLC expects it, for example `branchId:1001`.
  function toggleFacet(filterValue) {
    const value = text(filterValue);
    if (!value) return;

    const exists = facetFilters.includes(value);
    const nextFilters = exists
      ? facetFilters.filter((item) => item !== value)
      : [...facetFilters, value];

    setFacetFilters(nextFilters);

    runSearch({
      q: query,
      nextPage: 1,
      nextFacetFilters: nextFilters,
    });
  }

  const mapped = data?.mapped || {};
  const raw = data?.raw || {};
  const results = asArray(mapped?.results?.result).filter((result) => isNumericId(idForDetail(result)));
  const calls = asArray(raw?.debug?.calls);
  const allOclc = {
    perspectiveResponse: calls[0]?.body || {},
    titlesummaryResponse: raw?.searchResponse || calls[1]?.body || {},
    discoveryTitleResponses: asArray(raw?.discoveryTitleResponses),
  };
  const perspectives = asArray(raw?.perspectives);

  const selectedPerspective =
    perspectives.find((item) => String(item.id) === String(perspectiveId)) ||
    perspectives.find((item) => String(item.id) === String(raw?.selectedPerspectiveId)) ||
    perspectives[0];

  const sortings = asArray(selectedPerspective?.sortings);
  const searchScopes = asArray(selectedPerspective?.searchScopes);
  const facetGroups = extractFacetGroups(raw?.searchResponse, perspectives, perspectiveId);

  const csvRows = useMemo(() => buildSearchMappingRows(raw, mapped), [raw, mapped]);

  // Download the search mapping documentation as CSV.
  function downloadCsv() {
    try {
      const csv = toSearchMappingCsv(csvRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.setAttribute("download", `zoekpagina-mapping-${query || "zoekopdracht"}.csv`);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error("CSV download mislukt", downloadError);
      window.alert("CSV download mislukt. Controleer de console.");
    }
  }

  const resultCount = text(mapped?.meta?.count?._text) || "0";
  const hasQuery = Boolean(text(query));

  return (
    <div className="page">
      <div className="header-image">
        <img src="/header.JPG" alt="Header" />
      </div>

      <div className="container search-page oba-search-page">
        <nav className="oba-breadcrumbs" aria-label="Broodkruimelpad">
          <button type="button" className="oba-chip" onClick={() => router.back()}>← Terug</button>
          <span className="oba-chip oba-chip-dark">⌂</span>
          <span className="oba-chip">Zoeken</span>
        </nav>

        <section className="oba-search-top">
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
                placeholder="Waar ben je naar op zoek?" aria-label="Zoeken"
              />

              {query ? (
                <button
                  type="button"
                  className="oba-search-clear"
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                    runSearch({ q: "", nextPage: 1 });
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
                        runSearch({ q: suggestion, nextPage: 1 });
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
            <div className="filter-card filter-card-open">
              <div className="filter-card-title">Zoeken in</div>

              <div className="filter-options">
                {perspectives.length ? (
                  perspectives.map((perspective) => (
                    <button
                      key={perspective.id}
                      type="button"
                      className={
                        String(perspective.id) === String(perspectiveId)
                          ? "filter-radio active"
                          : "filter-radio"
                      }
                      onClick={() => changePerspective(String(perspective.id))}
                    >
                      <span className="radio-dot" />
                      <span>{perspectiveLabel(perspective)}</span>
                    </button>
                  ))
                ) : (
                  <div className="filter-empty">Catalogi laden...</div>
                )}
              </div>
            </div>

            {searchScopes.length ? (
              <div className="filter-card filter-card-open">
                <div className="filter-card-title">Zoekveld</div>

                <div className="filter-options">
                  {searchScopes.map((scope) => (
                    <button
                      key={scope.id}
                      type="button"
                      className={
                        scopeValue(scope) === String(searchScope).toLowerCase()
                          ? "filter-radio active"
                          : "filter-radio"
                      }
                      onClick={() => {
                        const nextScope = scopeValue(scope);
                        setSearchScope(nextScope);
                        runSearch({
                          q: query,
                          nextPage: 1,
                          nextSearchScope: nextScope,
                        });
                      }}
                    >
                      <span className="radio-dot" />
                      <span>{text(scope.labelText || scope.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {facetGroups.length ? (
              facetGroups.map((group) => (
                <div className="filter-card filter-card-open" key={`${group.field}-${group.label}`}>
                  <div className="filter-card-title">{group.label}</div>

                  {group.values.length ? (
                    <div className="filter-options">
                      {group.values.slice(0, 8).map((option) => {
                        const checked = facetFilters.includes(option.facetFilter);

                        return (
                          <button
                            key={`${group.field}-${option.facetFilter}-${option.label}`}
                            type="button"
                            className={checked ? "filter-checkbox active" : "filter-checkbox"}
                            onClick={() => toggleFacet(option.facetFilter)}
                          >
                            <span className="checkbox-dot" />
                            <span className="filter-label">{option.label}</span>
                            {option.count !== "" ? (
                              <span className="filter-count">{option.count}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="filter-empty">Geen waarden geladen</div>
                  )}
                </div>
              ))
            ) : null}
          </aside>

          <main className="oba-results-panel">
            {hasQuery ? (
              <div className="oba-results-heading">
                <div>
                  <h1>
                    '{text(mapped?.meta?.query?._text) || query}' in{" "}
                    {perspectiveLabel(selectedPerspective) || "OBA Collectie"}
                  </h1>
                  <div className="oba-result-count">{resultCount} resultaten</div>
                </div>

                <label className="oba-sort">
                  <span>Sorteren op:</span>
                  <select value={sort} onChange={(event) => changeSort(event.target.value)}>
                    {sortings.length ? (
                      sortings.map((sorting) => (
                        <option key={sorting.id} value={sorting.id}>
                          {sortLabel(sorting)}
                        </option>
                      ))
                    ) : (
                      <option value={DEFAULT_SORT}>relevantie</option>
                    )}
                  </select>
                </label>
              </div>
            ) : (
              <div className="oba-results-heading">
                <div>
                  <h1>Zoeken</h1>
                  <div className="oba-result-count">
                    Kies een catalogus of filter; resultaten verschijnen na een zoekopdracht.
                  </div>
                </div>
              </div>
            )}

            {hasQuery ? (
              <section className="oba-result-list">
                {results.length ? (
                  results.map((result, index) => {
                    const detailId = idForDetail(result);
                    const title = resultTitle(result);
                    const image = coverImage(result);
                    const author = text(result?.authors?.["main-author"]?._text);
                    const year = text(result?.publication?.year?._text);
                    const format = asArray(result?.formats?.format)
                      .map((item) => text(item?._text))
                      .filter(Boolean)
                      .join(", ");
                    const summary = text(result?.summaries?.summary?._text);
                    const resultSubjects = subjects(result);

                    return (
                      <article className="oba-result-item" key={`${detailId}-${index}`}>
                        <Link href={`/oba-detail/${encodeURIComponent(detailId)}`} className="oba-result-cover-link">
                          {image ? (
                            <img src={image} alt={title || "Cover"} className="oba-result-cover" />
                          ) : (
                            <div className="oba-result-cover empty-cover">Geen cover</div>
                          )}
                        </Link>

                        <div className="oba-result-body">
                          <Link href={`/oba-detail/${encodeURIComponent(detailId)}`} className="oba-result-title">
                            {title || "Onbekende titel"}
                          </Link>

                          {author ? <div className="oba-result-author">{author}</div> : null}

                          {format ? <div className="oba-result-type">{format}</div> : null}

                          <div className="oba-result-meta">
                            {[text(result?.languages?.language?._text), year].filter(Boolean).join(" | ")}
                          </div>

                          {summary ? <p className="oba-result-summary">{summary}</p> : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="info-card">Geen resultaten met een geldig detail-id</div>
                )}
              </section>
            ) : null}

            {hasQuery ? (
              <section className="pagination-row">
                <button
                  type="button"
                  className="tab-button"
                  disabled={Number(mapped?.meta?.page?._text || 1) <= 1}
                  onClick={() =>
                    runSearch({
                      q: query,
                      nextPage: Number(mapped?.meta?.page?._text || 1) - 1,
                    })
                  }
                >
                  vorige
                </button>

                <button
                  type="button"
                  className="tab-button active"
                  disabled={!results.length}
                  onClick={() =>
                    runSearch({
                      q: query,
                      nextPage: Number(mapped?.meta?.page?._text || 1) + 1,
                    })
                  }
                >
                  volgende
                </button>
              </section>
            ) : null}
          </main>
        </section>

        <section className="debug-section">
          <button type="button" className="tab-button" onClick={downloadCsv}>
            Download mapping CSV
          </button>

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

          <details className="debug-block">
            <summary>Mapped output</summary>
            <div className="debug-content">
              <pre>{pretty(mapped)}</pre>
            </div>
          </details>

        </section>
      </div>
    </div>
  );
}
