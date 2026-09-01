import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const pretty = (value) => JSON.stringify(value, null, 2);

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const SOURCE_LABELS = {
  collection: "collectie",
  agenda: "agenda",
};

function sourceLabel(source) {
  const key = text(source);
  return SOURCE_LABELS[key] || key;
}

function coverUrl(result = {}) {
  const ppn = encodeURIComponent(text(result.ppn));
  const isbn = encodeURIComponent(text(result.isbn));

  if (text(result.cover)) return text(result.cover);
  if (text(result.coverUrl)) return text(result.coverUrl);
  if (!ppn && !isbn) return "/placeholder.png";

  return `https://cover.biblion.nl/coverlist.dll/?doctype=morebutton&bibliotheek=oba&style=0&ppn=${ppn}&isbn=${isbn}&lid=&aut=&ti=&size=150`;
}

function resultTitle(result = {}) {
  return text(result.short_title || result.title || result.name || result.titel || result.naam);
}

function resultMeta(result = {}) {
  return [
    text(result.author || result.auteur),
    text(result.year || result.jaar || result.date || result.datum),
    text(result.location || result.locatie || result.gebouw),
    text(result.ppn ? `PPN ${result.ppn}` : ""),
  ].filter(Boolean).join(" | ");
}

function cleanFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => text(value))
  );
}

function filterStateFromGroups(groups = []) {
  return Object.fromEntries(asArray(groups).map((group) => [group.key, ""]));
}

function filterSourceFromResponse(response = {}) {
  const type = text(response?.type);
  if (type === "collection" || type === "agenda") return type;
  return "";
}

export default function NexiSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [threadId, setThreadId] = useState("");
  const [resolvedSource, setResolvedSource] = useState("");
  const [filters, setFilters] = useState({ groups: [] });
  const [selectedFilters, setSelectedFilters] = useState({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) return;

    const q = typeof router.query.q === "string" ? router.query.q : "";
    const tid = typeof router.query.thread_id === "string" ? router.query.thread_id : "";

    setQuery(q);
    setThreadId(tid);

    if (q) runSearch({ nextQuery: q, nextThreadId: tid, nextFilters: {}, updateUrl: false });
  }, [router.isReady]);

  function loadFilters(source) {
    const nextSource = text(source);
    if (!nextSource) return;

    setFilterLoading(true);
    fetch(`/api/nexi-filters?domain=${encodeURIComponent(nextSource)}`)
      .then((response) => response.json())
      .then((json) => {
        const nextFilters = json || { domain: nextSource, groups: [] };
        setFilters(nextFilters);
        setSelectedFilters(filterStateFromGroups(nextFilters.groups));
      })
      .catch(() => {
        setFilters({ domain: nextSource, groups: [] });
        setSelectedFilters({});
      })
      .finally(() => setFilterLoading(false));
  }

  function buildUrl(nextQuery, nextThreadId) {
    const params = new URLSearchParams();
    if (text(nextQuery)) params.set("q", text(nextQuery));
    if (text(nextThreadId)) params.set("thread_id", text(nextThreadId));
    const queryString = params.toString();
    return queryString ? `/nexi-search?${queryString}` : "/nexi-search";
  }

  function buildApiUrl({ nextQuery, nextThreadId, nextSource, nextFilters }) {
    const params = new URLSearchParams();
    if (text(nextQuery)) params.set("q", text(nextQuery));
    if (text(nextThreadId)) params.set("thread_id", text(nextThreadId));

    const activeFilters = cleanFilters(nextFilters);
    if (Object.keys(activeFilters).length && text(nextSource)) {
      params.set("filter_domain", text(nextSource));
      params.set("filters", JSON.stringify(activeFilters));
    }

    return `/api/nexi-search?${params.toString()}`;
  }

  function runSearch({
    nextQuery = query,
    nextThreadId = threadId,
    nextSource = resolvedSource,
    nextFilters = selectedFilters,
    updateUrl = true,
  } = {}) {
    const q = text(nextQuery);
    const activeFilters = cleanFilters(nextFilters);
    if (!q && !Object.keys(activeFilters).length) return;

    setLoading(true);
    setError("");

    fetch(buildApiUrl({ nextQuery: q, nextThreadId, nextSource, nextFilters: activeFilters }))
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error || `Request failed with status ${response.status}`);
        return json;
      })
      .then((json) => {
        const nextThreadIdValue = text(json?.thread_id);
        const nextSourceValue = filterSourceFromResponse(json?.response) || text(nextSource);

        setData(json);
        setThreadId(nextThreadIdValue);

        if (nextSourceValue && nextSourceValue !== resolvedSource) {
          setResolvedSource(nextSourceValue);
          loadFilters(nextSourceValue);
        }

        if (updateUrl) router.push(buildUrl(q || data?.query || query, nextThreadIdValue), undefined, { shallow: true });
      })
      .catch((err) => setError(err.message || "Onbekende fout"))
      .finally(() => setLoading(false));
  }

  function submit(event) {
    event.preventDefault();
    setResolvedSource("");
    setFilters({ groups: [] });
    setSelectedFilters({});
    runSearch({ nextQuery: query, nextThreadId: threadId, nextSource: "", nextFilters: {}, updateUrl: true });
  }

  function clearSearch() {
    setQuery("");
    setData(null);
    setError("");
    setThreadId("");
    setResolvedSource("");
    setFilters({ groups: [] });
    setSelectedFilters({});
    router.push("/nexi-search", undefined, { shallow: true });
  }

  function toggleFilter(groupKey, value) {
    if (!resolvedSource) return;

    const nextSelected = {
      ...selectedFilters,
      [groupKey]: selectedFilters[groupKey] === value ? "" : value,
    };
    setSelectedFilters(nextSelected);

    runSearch({
      nextQuery: text(data?.query) || query,
      nextThreadId: threadId,
      nextSource: resolvedSource,
      nextFilters: nextSelected,
      updateUrl: true,
    });
  }

  function clearFilters() {
    const cleared = filterStateFromGroups(filters.groups);
    setSelectedFilters(cleared);

    if (resolvedSource) {
      runSearch({
        nextQuery: text(data?.query) || query,
        nextThreadId: threadId,
        nextSource: resolvedSource,
        nextFilters: cleared,
        updateUrl: true,
      });
    }
  }

  const results = asArray(data?.results);
  const submittedQuery = text(data?.query);
  const activeFilterCount = Object.keys(cleanFilters(selectedFilters)).length;
  const showFilters = Boolean(resolvedSource && asArray(filters.groups).length);

  return (
    <div className="page">
      <div className="header-image">
        <img src="/header.JPG" alt="Header" />
      </div>

      <div className="container search-page oba-search-page">
        <nav className="oba-breadcrumbs" aria-label="Broodkruimelpad">
          <Link href="/" className="oba-chip">← Terug</Link>
          <span className="oba-chip oba-chip-dark">⌂</span>
          <span className="oba-chip">Zoeken met natuurlijke taal</span>
        </nav>

        <section className="oba-search-top">
          <form className="oba-search-form" onSubmit={submit}>
            <div className="search-input-wrap">
              <input
                className="oba-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Waar ben je naar op zoek?"
                aria-label="Zoeken met natuurlijke taal"
              />

              {query ? (
                <button type="button" className="oba-search-clear" onClick={clearSearch}>
                  ×
                </button>
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
            {filterLoading ? <div className="filter-empty">Filters laden...</div> : null}

            {showFilters ? asArray(filters.groups).map((group) => (
              <div className="filter-card filter-card-open" key={group.key}>
                <div className="filter-card-title">{group.label}</div>
                <div className="filter-options">
                  {asArray(group.options).map((option) => {
                    const active = selectedFilters[group.key] === option.value;
                    return (
                      <button
                        type="button"
                        className={active ? "filter-radio active" : "filter-radio"}
                        key={option.value}
                        onClick={() => toggleFilter(group.key, option.value)}
                      >
                        <span className="radio-dot" />
                        <span className="filter-label">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )) : null}

            {activeFilterCount ? (
              <button type="button" className="filter-clear-button" onClick={clearFilters}>
                Wis filters
              </button>
            ) : null}
          </aside>

          <main className="oba-results-panel">
            <div className="oba-results-heading">
              <div>
                <h1>{submittedQuery && resolvedSource ? `${submittedQuery} in ${sourceLabel(resolvedSource)}` : "Zoeken met natuurlijke taal"}</h1>
                <div className="oba-result-count">
                  {submittedQuery ? `${results.length.toLocaleString("nl-NL")} resultaten` : "Typ een natuurlijke-taal zoekvraag."}
                </div>
              </div>
            </div>

            {data?.response?.message ? <div className="info-card">{data.response.message}</div> : null}

            {submittedQuery || data ? (
              <section className="oba-result-list">
                {results.length ? (
                  results.map((result, index) => {
                    const title = resultTitle(result);
                    const image = coverUrl(result);
                    const link = text(result.link || result.url);
                    const meta = resultMeta(result);
                    const beschrijving = text(result.beschrijving);

                    return (
                      <article className="oba-result-item" key={`${result.ppn || title || "result"}-${index}`}>
                        <img
                          src={image || "/placeholder.png"}
                          alt={title || "Cover"}
                          className="oba-result-cover"
                          onError={(event) => {
                            event.currentTarget.src = "/placeholder.png";
                          }}
                        />

                        <div className="oba-result-body">
                          {link ? (
                            <a href={link} className="oba-result-title" target="_blank" rel="noreferrer">
                              {title || "Onbekende titel"}
                            </a>
                          ) : (
                            <span className="oba-result-title">{title || "Onbekende titel"}</span>
                          )}

                          {meta ? <div className="oba-result-meta">{meta}</div> : null}
                          {beschrijving ? <p className="oba-result-summary">{beschrijving}</p> : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="info-card">Geen resultaten</div>
                )}
              </section>
            ) : null}
          </main>
        </section>

        <section className="debug-section">
          <details className="debug-block">
            <summary>Nexi output</summary>
            <div className="debug-content">
              <pre>{pretty(data)}</pre>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
