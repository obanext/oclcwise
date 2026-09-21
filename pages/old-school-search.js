import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import OclcPreselect, { useOclcPerspectives } from "../components/OclcPreselect";
import { parsePreselect, preselectValue, resolvePreselect } from "../utils/oclcPreselect.js";
import { buildSearchUrl, isNbcPerspective } from "../utils/oclcSearchFilters.js";

const DEFAULT_SEARCH_SCOPE = "title";

const RADIO_OPTIONS = [
  "OBA Collectie",
  "Agenda",
  "Website",
  "E-books en luisterboeken",
  "Landelijke collectie",
  "Muziekweb",
];

const QUICK_LINKS = [
  "Pluche",
  "Zoals sneeuw valt",
  "Judith Fanto",
  "Superjuffie",
  "Voor ieder wat waars",
  "Anya Niewierra",
  "OBA locaties",
  "Max Havelaar",
];

export default function OldSchoolSearchPage() {
  const router = useRouter();
  const catalogs = useOclcPerspectives();

  const [query, setQuery] = useState("");
  const [preselect, setPreselect] = useState(preselectValue({}));
  const [filterAvailableTitles, setFilterAvailableTitles] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState("");
  const selection = resolvePreselect(preselect);
  const backend = catalogs.perspectives.find((entry) => entry.id === selection.perspectiveId)?.backend || "";
  const nbc = isNbcPerspective(selection.perspectiveId, backend);

  useEffect(() => {
    let active = true;

    fetch("/api/wise-branches")
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(json?.error || `Request failed with status ${response.status}`);
        }
        return json;
      })
      .then((json) => {
        if (!active) return;
        setBranches(Array.isArray(json?.branches) ? json.branches : []);
      })
      .catch((error) => {
        if (!active) return;
        setBranches([]);
        setBranchesError(error.message || "Vestigingen laden mislukt");
      })
      .finally(() => {
        if (active) setBranchesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedLabel = useMemo(() => {
    const selected = parsePreselect(preselect);

    if (selected.type === "branch") {
      return (
        branches.find((option) => option.branchId === selected.value)?.name ||
        "WISE-vestiging"
      );
    }

    return (
      catalogs.perspectives.find((option) => option.id === selected.value)?.label ||
      "In jouw bibliotheek"
    );
  }, [branches, preselect, catalogs.perspectives]);

  function changePreselect(value) {
    const next = resolvePreselect(value);
    const nextBackend = catalogs.perspectives.find((entry) => entry.id === next.perspectiveId)?.backend || "";
    setPreselect(value);
    if (isNbcPerspective(next.perspectiveId, nextBackend)) setFilterAvailableTitles(false);
  }

  function submitSearch(event) {
    event.preventDefault();

    router.push(buildSearchUrl({
      q: query, nextSearchRequested: true, nextPerspectiveId: selection.perspectiveId,
      nextSearchScope: DEFAULT_SEARCH_SCOPE,
      nextFacetFilters: selection.branchId ? [`branchId:${selection.branchId}`] : [],
      nextFilterAvailableTitles: !nbc && filterAvailableTitles,
    }, { backend }));
  }

  return (
    <main>
      <div className="header-image">
        <img src="/header.JPG" alt="OBA" />
      </div>

      <div className="container old-school-page">
        <nav className="old-school-breadcrumb" aria-label="Breadcrumb">
          <a href="/">← Terug</a>
          <span className="old-school-home" aria-hidden="true">⌂</span>
          <span>Zoeken</span>
        </nav>

        <section className="old-school-search-panel">
          <h1>Zoeken</h1>

          <div className="old-school-radio-row" aria-label="Zoek in">
            <p>Zoek in</p>
            <div className="old-school-radio-options">
              {RADIO_OPTIONS.map((label, index) => (
                <label key={label} className="old-school-radio-option">
                  <input type="radio" name="search-in" checked={index === 0} readOnly />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <form className="old-school-form" onSubmit={submitSearch}>
            <div className="old-school-combined-search">
              <label className="sr-only" htmlFor="old-school-preselect">
                Voorselectie
              </label>

              <OclcPreselect
                id="old-school-preselect"
                value={preselect}
                onChange={changePreselect}
                perspectives={catalogs.perspectives}
                loading={catalogs.loading}
                branches={branches}
                branchesLoading={branchesLoading}
                branchGroupLabel="Actieve locaties uit WISE CG0"
              />

              <div className="old-school-search-input-wrap">
                <span className="old-school-search-icon" aria-hidden="true">⌕</span>
                <input
                  className="old-school-search-input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Zoek in de collectie, agenda of website"
                  aria-label="Zoekterm"
                />
              </div>
            </div>

            <button className="old-school-submit" type="submit" aria-label="Zoeken">
              →
            </button>

            <label className="old-school-available-toggle">
              <input
                type="checkbox"
                checked={filterAvailableTitles}
                disabled={nbc}
                onChange={(event) => setFilterAvailableTitles(event.target.checked)}
              />
              <span>Aanwezig</span>
            </label>
          </form>
          {catalogs.error ? <p role="alert">{catalogs.error}</p> : null}

          {branchesError ? (
            <p className="search-error">Vestigingen konden niet worden geladen: {branchesError}</p>
          ) : null}

          <p className="old-school-debug-line">
            Actieve voorselectie: <strong>{selectedLabel}</strong>. Bij zoeken wordt doorgestuurd naar
            <code>/oclc-search</code> met <code>perspectiveId</code>, eventueel
            <code>facetFilter=branchId:&lt;id&gt;</code> en
            <code>filterAvailableTitles=true</code>.
          </p>
        </section>

        <section className="old-school-quick-links" aria-label="Populaire zoektermen">
          <h2>Populaire zoektermen</h2>
          <div className="old-school-quick-grid">
            {QUICK_LINKS.map((term) => (
              <span key={term}>{term}</span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
