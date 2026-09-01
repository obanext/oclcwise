import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const GENRES = [
  ["", "Kies een waarde"],
  ["DI", "Dieren"],
  ["DE", "Detective"],
  ["GR", "Griezelverhaal"],
  ["AV", "Spanning en avontuur"],
  ["SK", "Sprookjes"],
  ["VH", "Verhalen"],
  ["HU", "Humor"],
  ["ST", "Stripverhaal"],
];

const FORMATS = [
  ["", "Kies een waarde"],
  ["BOE", "Boek"],
  ["STR", "Strip"],
  ["DVD", "DVD-video"],
  ["BLR", "Blu-ray"],
  ["MLB", "Meeluisterboek"],
  ["LUI", "Luisterboek"],
  ["SPG", "Speelgoed"],
];

const LANGUAGES = [
  ["", "Kies een waarde"],
  ["DUT", "Nederlands"],
  ["ENG", "Engels"],
  ["GER", "Duits"],
  ["FRE", "Frans"],
  ["ARA", "Arabisch"],
  ["TUR", "Turks"],
];

const BRANCHES = [
  ["", "Kies een waarde"],
  ["1000", "A'veen Stadsplein"],
  ["1001", "A'veen Westwijk"],
  ["1002", "Aalsmeer"],
  ["1003", "Uithoorn"],
  ["1004", "Kudelstaart"],
];

const COLLECTIONS = [["", "Kies een waarde"]];

const YOUTH = [
  ["", "Kies een waarde"],
  ["JN", "Jeugd"],
  ["NJ", "Volwassen"],
];

const emptyForm = {
  q: "",
  title: "",
  author: "",
  mediumTypeCode: "",
  branchId: "",
  placementCode: "",
  year: "",
  genreCode: "",
  languageCode: "",
  subject: "",
  issn: "",
  publisher: "",
  isbn: "",
  series: "",
  collection: "",
  audienceCode: "",
  content: "",
  available: false,
};

function buildQuery(form) {
  const parts = [];

  if (text(form.q)) parts.push(text(form.q));
  if (text(form.title)) parts.push(`title:"${text(form.title)}"`);
  if (text(form.author)) parts.push(`author:"${text(form.author)}"`);
  if (text(form.mediumTypeCode)) parts.push(`format:"${text(form.mediumTypeCode)}"`);
  if (text(form.branchId)) parts.push(`library:"${text(form.branchId)}"`);
  if (text(form.placementCode)) parts.push(`placementCode:"${text(form.placementCode)}"`);
  if (text(form.year)) parts.push(`year:"${text(form.year)}"`);
  if (text(form.genreCode)) parts.push(`genre:"${text(form.genreCode)}"`);
  if (text(form.languageCode)) parts.push(`language:"${text(form.languageCode)}"`);
  if (text(form.subject)) parts.push(`subject:"${text(form.subject)}"`);
  if (text(form.issn)) parts.push(`issn:"${text(form.issn)}"`);
  if (text(form.publisher)) parts.push(`publisher:"${text(form.publisher)}"`);
  if (text(form.isbn)) parts.push(`isbn:"${text(form.isbn)}"`);
  if (text(form.series)) parts.push(`series:"${text(form.series)}"`);
  if (text(form.collection)) parts.push(`collection:"${text(form.collection)}"`);
  if (text(form.audienceCode)) parts.push(`youth:"${text(form.audienceCode)}"`);
  if (text(form.content)) parts.push(`content:"${text(form.content)}"`);
  if (form.available) parts.push("available:true");

  return parts.join(" ");
}

function yearFacet(value) {
  const year = text(value);
  if (!/^\d{4}$/.test(year)) return "";
  return `publicationYear:${year}-01-01T00:00:00Z`;
}

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

function determinePrimarySearch(form) {
  const free = text(form.q);

  if (free) {
    return { q: free, searchScope: "anything" };
  }

  const scopedFields = [
    { value: form.title, searchScope: "title" },
    { value: form.author, searchScope: "author" },
  ].filter((field) => text(field.value));

  const directFacetFields = [
    form.subject,
    form.series,
    form.year,
    form.genreCode,
    form.mediumTypeCode,
    form.languageCode,
    form.branchId,
    form.audienceCode,
  ].filter((value) => text(value));

  const termFilterFields = [
    form.isbn,
    form.issn,
    form.publisher,
    form.placementCode,
    form.content,
  ].filter((value) => text(value));

  const unsupportedTextFields = [form.collection].filter((value) => text(value));

  if (
    scopedFields.length === 1 &&
    directFacetFields.length === 0 &&
    termFilterFields.length === 0 &&
    unsupportedTextFields.length === 0
  ) {
    return { q: text(scopedFields[0].value), searchScope: scopedFields[0].searchScope };
  }

  if (unsupportedTextFields.length > 0 || scopedFields.length > 1) {
    return { q: buildQuery(form), searchScope: "anything" };
  }

  return { q: "*.*", searchScope: "anything" };
}

function buildOclcSearchUrl(form) {
  const params = new URLSearchParams();
  const primary = determinePrimarySearch(form);

  const filters = [
    yearFacet(form.year),
    text(form.genreCode) ? `genreCode:${text(form.genreCode)}` : "",
    text(form.mediumTypeCode) ? `mediumTypeCode:${text(form.mediumTypeCode)}` : "",
    text(form.languageCode) ? `languageCode:${text(form.languageCode)}` : "",
    text(form.branchId) ? `branchId:${text(form.branchId)}` : "",
    text(form.audienceCode) ? `audienceCode:${text(form.audienceCode)}` : "",
    text(form.subject) ? `subject:${text(form.subject)}` : "",
    text(form.series) ? `series:${text(form.series)}` : "",
  ].filter(Boolean);

  const termFilters = [
    normalizeIsbn(form.isbn) ? `isbn:${normalizeIsbn(form.isbn)}` : "",
    normalizeIdentifier(form.issn) ? `issn:${normalizeIdentifier(form.issn)}` : "",
    termFilter("publisher", form.publisher),
    termFilter("placementCode", form.placementCode),
    termFilter("content", form.content),
  ].filter(Boolean);

  params.set("q", primary.q);
  params.set("page", "1");
  params.set("searchScope", primary.searchScope);
  params.set("sort", "2910");
  params.set("perspectiveId", "3682");

  filters.forEach((filter) => params.append("facetFilter", filter));
  termFilters.forEach((filter) => params.append("termFilter", filter));

  if (form.available) {
    params.set("filterAvailableTitles", "true");
  }

  return `/oclc-search?${params.toString()}`;
}

export default function AdvancedSearchPage() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const queryPreview = useMemo(() => buildQuery(form), [form]);

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
            <span>Samenvatting zoekcriteria</span>
            <textarea className="advanced-query-preview" value={queryPreview} readOnly />
          </label>

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
                {FORMATS.map(([value, label]) => (
                  <option key={value || "empty"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Bibliotheek</span>
              <select value={form.branchId} onChange={(event) => setField("branchId", event.target.value)}>
                {BRANCHES.map(([value, label]) => (
                  <option key={value || "empty"} value={value}>
                    {label}
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
                value={form.year}
                onChange={(event) =>
                  setField("year", event.target.value.replace(/[^\d]/g, "").slice(0, 4))
                }
              />
            </label>

            <label className="advanced-field">
              <span>Genre</span>
              <select value={form.genreCode} onChange={(event) => setField("genreCode", event.target.value)}>
                {GENRES.map(([value, label]) => (
                  <option key={value || "empty"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Taal</span>
              <select value={form.languageCode} onChange={(event) => setField("languageCode", event.target.value)}>
                {LANGUAGES.map(([value, label]) => (
                  <option key={value || "empty"} value={value}>
                    {label}
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
              <select value={form.audienceCode} onChange={(event) => setField("audienceCode", event.target.value)}>
                {YOUTH.map(([value, label]) => (
                  <option key={value || "empty"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="advanced-field">
              <span>Inhoud</span>
              <input value={form.content} onChange={(event) => setField("content", event.target.value)} />
            </label>

            <div className="advanced-actions">
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
          Resultaten openen in <code>/oclc-search</code>.
        </p>

        <p className="preselect-contact">
          <Link href="/">Terug naar overzicht</Link>
        </p>
      </div>
    </main>
  );
}
