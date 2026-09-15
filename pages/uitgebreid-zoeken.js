import Link from "next/link";
import fs from "fs";
import path from "path";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  ADVANCED_SEARCH_MAPPING_ROWS,
  toAdvancedSearchMappingCsv,
} from "../utils/advancedSearchMappingRows";

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const COLLECTIONS = [["", "Kies een waarde"]];

const emptyForm = {
  term: "",
  title: "",
  author: "",
  authorFacetValue: "",
  mediumTypeCode: "",
  branchId: "",
  placementCode: "",
  year: "",
  yearFrom: "",
  yearTo: "",
  genreCode: "",
  languageCode: "",
  subject: "",
  issn: "",
  publisher: "",
  isbn: "",
  series: "",
  collection: "",
  targetAudienceCode: "",
  content: "",
  available: false,
};

function termFilter(field, value) {
  const clean = text(value);
  if (!field || !clean) return "";
  return `${field}:${clean}`;
}

function yearFacet(yearValue, yearFromValue, yearToValue) {
  const year = text(yearValue);
  const yearFrom = text(yearFromValue);
  const yearTo = text(yearToValue);

  if (/^\d+$/.test(year)) return `customPublicationYear:${year}`;
  if (/^\d+$/.test(yearFrom) && /^\d+$/.test(yearTo)) {
    return `customPublicationYear:${yearFrom}-${yearTo}`;
  }
  return "";
}

function determinePrimarySearch(form) {
  if (text(form.subject)) {
    return { term: text(form.subject), searchScope: "subject", source: "subject" };
  }

  if (text(form.term)) {
    return { term: text(form.term), searchScope: "anything", source: "term" };
  }

  if (text(form.title)) {
    return { term: text(form.title), searchScope: "title", source: "title" };
  }

  if (text(form.author)) {
    return { term: text(form.author), searchScope: "author", source: "author" };
  }

  if (text(form.series)) {
    return { term: text(form.series), searchScope: "series", source: "series" };
  }

  return { term: "", searchScope: "anything", source: "" };
}

function buildSearchState(form) {
  const primary = determinePrimarySearch(form);

  const facetFilters = [
    primary.source !== "author" && text(form.authorFacetValue)
      ? `authorFacet:${text(form.authorFacetValue)}`
      : "",
    text(form.mediumTypeCode) ? `mediumTypeCode:${text(form.mediumTypeCode)}` : "",
    text(form.branchId) ? `branchId:${text(form.branchId)}` : "",
    yearFacet(form.year, form.yearFrom, form.yearTo),
    text(form.genreCode) ? `genreCode:${text(form.genreCode)}` : "",
    text(form.languageCode) ? `languageCode:${text(form.languageCode)}` : "",
    primary.source !== "series" && text(form.series) ? `series:${text(form.series)}` : "",
    text(form.targetAudienceCode)
      ? `targetAudienceCode:${text(form.targetAudienceCode)}`
      : "",
  ].filter(Boolean);

  const termFilters = [
    primary.source !== "title" && text(form.title) ? termFilter("title", form.title) : "",
    termFilter("placementCode", form.placementCode),
    termFilter("issn", form.issn),
    termFilter("publisher", form.publisher),
    termFilter("isbn", form.isbn),
    termFilter("content", form.content),
  ].filter(Boolean);

  return {
    term: primary.term,
    searchScope: primary.searchScope,
    facetFilters,
    termFilters,
    filterAvailableTitles: Boolean(form.available),
  };
}

function subjectHasOtherCriteria(form) {
  if (!text(form.subject)) return false;

  return [
    form.term,
    form.title,
    form.author,
    form.mediumTypeCode,
    form.branchId,
    form.placementCode,
    form.year,
    form.yearFrom,
    form.yearTo,
    form.genreCode,
    form.languageCode,
    form.issn,
    form.publisher,
    form.isbn,
    form.series,
    form.collection,
    form.targetAudienceCode,
    form.content,
  ].some((value) => text(value)) || Boolean(form.available);
}


function getAuthorFacetOptions(data = {}) {
  const facets = Array.isArray(data?.facets) ? data.facets : [];
  const authorFacet = facets.find((facet) => text(facet?.name) === "authorFacet");
  const values = Array.isArray(authorFacet?.values) ? authorFacet.values : [];
  const seen = new Set();

  return values
    .map((option) => {
      const value = text(option?.term || option?.label);
      const label = text(option?.label || option?.term);
      return { value, label: label || value };
    })
    .filter((option) => {
      const key = option.value.toLocaleLowerCase("nl");
      if (!option.value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findAuthorFacetValue(options, value) {
  const needle = text(value).toLocaleLowerCase("nl");
  if (!needle) return "";

  const match = options.find(
    (option) =>
      text(option.value).toLocaleLowerCase("nl") === needle ||
      text(option.label).toLocaleLowerCase("nl") === needle
  );

  return text(match?.value);
}

function appendSearchParams(params, state, { includePage = false } = {}) {
  if (text(state.term)) params.set("term", text(state.term));

  if (text(state.term) || state.termFilters.length) {
    params.set("searchScope", state.searchScope || "anything");
  }

  state.facetFilters.forEach((filter) => params.append("facetFilter", filter));
  state.termFilters.forEach((filter) => params.append("termFilter", filter));

  if (state.filterAvailableTitles) {
    params.set("filterAvailableTitles", "true");
  }

  if (includePage) params.set("page", "1");

  return params;
}

function buildOclcSearchUrl(form) {
  const params = appendSearchParams(new URLSearchParams(), buildSearchState(form), {
    includePage: true,
  });
  return `/oclc-search?${params.toString()}`;
}

function buildOclcRequestPreview(form) {
  const params = appendSearchParams(new URLSearchParams(), buildSearchState(form));
  const queryString = params.toString();
  const endpoint = "/branch/{branchId}/perspective/{perspectiveId}/titlesummary";
  return queryString ? `${endpoint}?${queryString}` : endpoint;
}

function downloadMappingCsv() {
  try {
    const csv = toAdvancedSearchMappingCsv(ADVANCED_SEARCH_MAPPING_ROWS);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.setAttribute("download", "uitgebreid-zoeken-oclc-mapping.csv");
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("CSV download mislukt", error);
    window.alert("CSV download mislukt. Controleer de console.");
  }
}

export default function AdvancedSearchPage({ metadataOptions, branches }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [authorOptions, setAuthorOptions] = useState([]);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorError, setAuthorError] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const queryPreview = useMemo(() => buildOclcRequestPreview(form), [form]);

  useEffect(() => {
    const author = text(form.author);

    if (author.length < 2) {
      setAuthorOptions([]);
      setAuthorLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAuthorLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("term", author);
        params.set("searchScope", "author");
        params.set("limit", "20");

        const response = await fetch(`/api/oclc-search?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const options = getAuthorFacetOptions(data);
        setAuthorOptions(options);

        const exactValue = findAuthorFacetValue(options, author);
        if (exactValue) {
          setForm((current) =>
            text(current.author) === author
              ? { ...current, authorFacetValue: exactValue }
              : current
          );
        }
      } catch (error) {
        if (error?.name !== "AbortError") setAuthorOptions([]);
      } finally {
        if (!controller.signal.aborted) setAuthorLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.author]);

  function setField(name, value) {
    if (name === "subject") setSubjectError("");
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function setSingleYear(value) {
    const year = value.replace(/[^\d]/g, "");
    setForm((current) => ({
      ...current,
      year,
      yearFrom: "",
      yearTo: "",
    }));
  }

  function setYearFrom(value) {
    const yearFrom = value.replace(/[^\d]/g, "");
    setForm((current) => ({
      ...current,
      year: "",
      yearFrom,
      yearTo: yearFrom ? String(Number(yearFrom) + 1) : "",
    }));
  }

  function setYearTo(value) {
    const yearTo = value.replace(/[^\d]/g, "");
    setForm((current) => ({
      ...current,
      year: "",
      yearFrom: yearTo ? String(Math.max(0, Number(yearTo) - 1)) : "",
      yearTo,
    }));
  }

  function setAuthor(value) {
    const authorFacetValue = findAuthorFacetValue(authorOptions, value);
    setAuthorError("");
    setForm((current) => ({
      ...current,
      author: value,
      authorFacetValue,
    }));
  }

  function submit(event) {
    event.preventDefault();

    if (subjectHasOtherCriteria(form)) {
      setSubjectError("Onderwerp kan niet met andere zoekcriteria worden gecombineerd.");
      return;
    }

    const primary = determinePrimarySearch(form);
    if (text(form.author) && primary.source !== "author" && !text(form.authorFacetValue)) {
      setAuthorError("Kies de auteur uit de OCLC-suggesties.");
      return;
    }

    setAuthorError("");
    setSubjectError("");
    router.push(buildOclcSearchUrl(form));
  }

  function reset() {
    setForm(emptyForm);
    setAuthorOptions([]);
    setAuthorError("");
    setSubjectError("");
  }

  return (
    <main>
      <div className="header-image">
        <img src="/header.JPG" alt="OBA" />
      </div>

      <div className="container advanced-search-page">
        <section className="preselect-intro">
          <h1>Uitgebreid zoeken</h1>
        </section>

        <form className="old-school-form" onSubmit={submit}>
          <div className="old-school-combined-search">
            <select
              className="old-school-select"
              value="catalogus"
              onChange={() => {}}
              aria-label="Zoekcollectie"
            >
              <option value="catalogus">Catalogus</option>
            </select>

            <div className="old-school-search-input-wrap">
              <span className="old-school-search-icon">⌕</span>
              <input
                className="old-school-search-input"
                value={form.term}
                onChange={(event) => setField("term", event.target.value)}
                placeholder="Waar ben je naar op zoek?"
              />
            </div>
          </div>

          <label className="old-school-available-toggle">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(event) => setField("available", event.target.checked)}
            />
            <span>Aanwezig</span>
          </label>

          <button className="old-school-submit" type="submit" aria-label="Zoeken">
            →
          </button>
        </form>

        <section className="advanced-search-card">
          <label className="advanced-field advanced-query-field">
            <span>OCLC request</span>
            <textarea className="advanced-query-preview" value={queryPreview} readOnly />
          </label>
          <form className="advanced-filter-list" onSubmit={submit}>
            <label className="advanced-field">
              <span>Titel</span>
              <input value={form.title} onChange={(event) => setField("title", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Auteur</span>
              <input
                list="advanced-author-options"
                value={form.author}
                onChange={(event) => setAuthor(event.target.value)}
                autoComplete="off"
              />
              <datalist id="advanced-author-options">
                {authorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </datalist>
              {authorLoading ? <small>Auteurs ophalen…</small> : null}
              {authorError ? <small>{authorError}</small> : null}
            </label>

            <label className="advanced-field">
              <span>Formaat</span>
              <select
                value={form.mediumTypeCode}
                onChange={(event) => setField("mediumTypeCode", event.target.value)}
              >
                <option value="">Kies een waarde</option>
                {metadataOptions.formats.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Bibliotheek</span>
              <select value={form.branchId} onChange={(event) => setField("branchId", event.target.value)}>
                <option value="">Kies een waarde</option>
                {branches.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Plaatsingscode (check)</span>
              <input
                value={form.placementCode}
                onChange={(event) => setField("placementCode", event.target.value)}
              />
            </label>

            <label className="advanced-field">
              <span>Jaar</span>
              <input
                inputMode="numeric"
                value={form.year}
                min="0"
                onChange={(event) => setSingleYear(event.target.value)}
                placeholder="bijv. 2022"
              />
            </label>

            <label className="advanced-field">
              <span>Jaar</span>
              <div className="advanced-year-range">
                <input
                  inputMode="numeric"
                  value={form.yearFrom}
                  min="0"
                  onChange={(event) => setYearFrom(event.target.value)}
                  aria-label="Jaar vanaf"
                />
                <span>tot</span>
                <input
                  inputMode="numeric"
                  value={form.yearTo}
                  min="0"
                  onChange={(event) => setYearTo(event.target.value)}
                  aria-label="Jaar tot"
                />
              </div>
            </label>

            <label className="advanced-field">
              <span>Genre</span>
              <select value={form.genreCode} onChange={(event) => setField("genreCode", event.target.value)}>
                <option value="">Kies een waarde</option>
                {metadataOptions.genres.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Taal</span>
              <select value={form.languageCode} onChange={(event) => setField("languageCode", event.target.value)}>
                <option value="">Kies een waarde</option>
                {metadataOptions.languages.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Onderwerp</span>
              <input value={form.subject} onChange={(event) => setField("subject", event.target.value)} />
              {subjectError ? <small>{subjectError}</small> : null}
            </label>

            <label className="advanced-field">
              <span>ISSN (check)</span>
              <input value={form.issn} onChange={(event) => setField("issn", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Uitgever (check)</span>
              <input value={form.publisher} onChange={(event) => setField("publisher", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>ISBN (check)</span>
              <input value={form.isbn} onChange={(event) => setField("isbn", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Reeks</span>
              <input value={form.series} onChange={(event) => setField("series", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Collectie (check)</span>
              <select
                value={form.collection}
                onChange={(event) => setField("collection", event.target.value)}
              >
                {COLLECTIONS.map(([value, label]) => (
                  <option key={value || "empty"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Jeugd</span>
              <select
                value={form.targetAudienceCode}
                onChange={(event) => setField("targetAudienceCode", event.target.value)}
              >
                <option value="">Kies een waarde</option>
                {metadataOptions.youth.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Inhoud (check)</span>
              <input value={form.content} onChange={(event) => setField("content", event.target.value)} />
            </label>

            <div className="advanced-actions">
              <button type="button" className="advanced-clear" onClick={downloadMappingCsv}>
                Download mapping CSV
              </button>
              <button type="button" className="advanced-clear" onClick={reset}>
                Wis
              </button>
              <button type="submit" className="advanced-submit">
                Zoek
              </button>
            </div>
          </form>
        </section>


        <p className="preselect-contact">
          <Link href="/">Terug naar overzicht</Link>
        </p>
      </div>
    </main>
  );
}

function readMetadataOptions(filename) {
  const filePath = path.join(process.cwd(), "data", "wise", filename);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  return (Array.isArray(data?.items) ? data.items : [])
    .map((item) => ({
      code: text(item?.code),
      label: text(item?.value),
    }))
    .filter((item) => item.code && item.label);
}

function readBranchOptions() {
  const filePath = path.join(process.cwd(), "data", "wise", "branch.txt");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  return (Array.isArray(data?.items) ? data.items : [])
    .map((item) => ({
      id: text(item?.id),
      name: text(item?.name || item?.description),
    }))
    .filter((item) => item.id && item.name)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

export function getStaticProps() {
  return {
    props: {
      metadataOptions: {
        formats: readMetadataOptions("mediumtypecode.txt"),
        genres: readMetadataOptions("genrecode.txt"),
        languages: readMetadataOptions("languagecode.txt"),
        youth: readMetadataOptions("targetaudiencecode.txt"),
      },
      branches: readBranchOptions(),
    },
  };
}
