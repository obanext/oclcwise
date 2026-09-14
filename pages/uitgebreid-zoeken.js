import Link from "next/link";
import fs from "fs";
import path from "path";
import { useMemo, useState } from "react";
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
  q: "",
  title: "",
  author: "",
  mediumTypeCode: "",
  branchId: "",
  placementCode: "",
  year: "",
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

function normalizeIsbn(value) {
  return text(value).replace(/[\s-]/g, "");
}

function normalizeIdentifier(value) {
  return text(value).replace(/[\s-]/g, "");
}

function termFilter(field, value) {
  const clean = text(value);
  if (!field || !clean) return "";
  return `${field}:${clean}`;
}

function yearFacet(yearValue, yearToValue) {
  const year = text(yearValue);
  const yearTo = text(yearToValue);
  const hasYear = /^\d{4}$/.test(year);
  const hasYearTo = /^\d{4}$/.test(yearTo);

  if (hasYear && hasYearTo) return `customPublicationYear:${year}-${yearTo}`;
  if (hasYear) return `customPublicationYear:${year}`;
  if (hasYearTo) return `customPublicationYear:${yearTo}`;
  return "";
}

function determinePrimarySearch(form) {
  if (text(form.q)) {
    return { term: text(form.q), searchScope: "anything" };
  }

  if (text(form.title)) {
    return { term: text(form.title), searchScope: "title" };
  }

  return { term: "", searchScope: "anything" };
}

function buildSearchState(form) {
  const primary = determinePrimarySearch(form);

  const facetFilters = [
    text(form.author) ? `authorFacet:${text(form.author)}` : "",
    text(form.mediumTypeCode) ? `mediumTypeCode:${text(form.mediumTypeCode)}` : "",
    text(form.branchId) ? `branchId:${text(form.branchId)}` : "",
    yearFacet(form.year, form.yearTo),
    text(form.genreCode) ? `genreCode:${text(form.genreCode)}` : "",
    text(form.languageCode) ? `languageCode:${text(form.languageCode)}` : "",
    text(form.subject) ? `subject:${text(form.subject)}` : "",
    text(form.series) ? `series:${text(form.series)}` : "",
    text(form.targetAudienceCode)
      ? `targetAudienceCode:${text(form.targetAudienceCode)}`
      : "",
  ].filter(Boolean);

  const termFilters = [
    text(form.q) && text(form.title) ? termFilter("title", form.title) : "",
    normalizeIsbn(form.isbn) ? `isbn:${normalizeIsbn(form.isbn)}` : "",
    normalizeIdentifier(form.issn) ? `issn:${normalizeIdentifier(form.issn)}` : "",
    termFilter("publisher", form.publisher),
    termFilter("placementCode", form.placementCode),
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
  const endpoint = "/branch/{branchId}/perspective/{perspectiveId}/search";
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
  const queryPreview = useMemo(() => buildOclcRequestPreview(form), [form]);

  function setField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function submit(event) {
    event.preventDefault();
    router.push(buildOclcSearchUrl(form));
  }

  function reset() {
    setForm(emptyForm);
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
                value={form.q}
                onChange={(event) => setField("q", event.target.value)}
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
          <p className="advanced-request-note">
            De testhost en concrete branch/perspective-testwaarden zijn bewust niet in dit overzicht opgenomen.
          </p>

          <form className="advanced-filter-list" onSubmit={submit}>
            <label className="advanced-field">
              <span>Titel</span>
              <input value={form.title} onChange={(event) => setField("title", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Auteur</span>
              <input value={form.author} onChange={(event) => setField("author", event.target.value)} />
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
              <span>Plaatsingscode</span>
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
                onChange={(event) =>
                  setField("year", event.target.value.replace(/[^\d]/g, "").slice(0, 4))
                }
                placeholder="bijv. 2022"
              />
            </label>

            <label className="advanced-field">
              <span>Jaar tot</span>
              <input
                inputMode="numeric"
                value={form.yearTo}
                onChange={(event) =>
                  setField("yearTo", event.target.value.replace(/[^\d]/g, "").slice(0, 4))
                }
                placeholder="bijv. 2023"
              />
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
            </label>

            <label className="advanced-field">
              <span>ISSN</span>
              <input value={form.issn} onChange={(event) => setField("issn", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Uitgever</span>
              <input value={form.publisher} onChange={(event) => setField("publisher", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>ISBN</span>
              <input value={form.isbn} onChange={(event) => setField("isbn", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Reeks</span>
              <input value={form.series} onChange={(event) => setField("series", event.target.value)} />
            </label>

            <label className="advanced-field">
              <span>Collectie</span>
              <select value={form.collection} onChange={(event) => setField("collection", event.target.value)}>
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
              <span>Inhoud</span>
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

        <p className="old-school-debug-line">
          Resultaten openen in <code>/oclc-search</code>; queryparameters blijven zo dicht mogelijk bij OCLC Discovery.
        </p>

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
