import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { buildOclcDetailRows, toOclcDetailCsv } from "../../utils/oclcDetailRows.js";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const rawText = (value) => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const pretty = (value) => JSON.stringify(value, null, 2);

function escapeCsvCell(value) {
  const cell = rawText(value);
  return /[";\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function toDisplayedFieldsCsv(rows = []) {
  const columns = [
    ["order", "Volgorde"],
    ["section", "Onderdeel"],
    ["label", "Getoonde veldnaam"],
    ["field", "OCLC-veldnaam"],
    ["value", "Waarde"],
    ["endpoint", "Endpoint path"],
    ["note", "Opmerking"],
  ];

  return [
    columns.map(([, label]) => escapeCsvCell(label)).join(";"),
    ...rows.map((row) => columns.map(([key]) => escapeCsvCell(row?.[key])).join(";")),
  ].join("\n");
}

function firstSource(candidates) {
  return candidates.find((candidate) => hasValue(candidate.value)) || candidates[0];
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function firstReadableValue(value, preferredKeys = []) {
  const selected = firstValue(value);
  if (!selected || typeof selected !== "object") return selected;

  for (const key of preferredKeys) {
    if (hasValue(selected?.[key])) return selected[key];
  }

  return "";
}

function firstReadableProperty(value, preferredKeys = []) {
  const selected = firstValue(value);
  if (!selected || typeof selected !== "object") return "";
  return preferredKeys.find((key) => hasValue(selected?.[key])) || "";
}

function firstValueField(field, value, property = "") {
  const arrayPart = Array.isArray(value) ? "[0]" : "";
  const propertyPart = property ? `.${property}` : "";
  return `${field}${arrayPart}${propertyPart}`;
}

function splitAuthorName(value = "") {
  const source = String(value || "").trim();
  if (!source) return { firstName: "", lastName: "" };

  if (source.includes(",")) {
    const [lastName = "", ...firstNameParts] = source.split(",");
    return {
      firstName: firstNameParts.join(",").trim(),
      lastName: lastName.trim(),
    };
  }

  const parts = source.split(/\s+/).filter(Boolean);
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) || "",
  };
}

function targetAudienceLabel(titleRecord = {}) {
  if (titleRecord.categoryYouth === true && titleRecord.categoryAdult === true) {
    return "Jeugd en volwassenen";
  }
  if (titleRecord.categoryYouth === true) return "Jeugd";
  if (titleRecord.categoryAdult === true) return "Volwassenen";
  return "";
}

function youthAgeRangeLabel(titleRecord = {}, ageRange = {}) {
  if (titleRecord.categoryYouth !== true) return "";

  const from = ageRange?.from;
  const to = ageRange?.to;
  if (hasValue(from) && hasValue(to)) return `${from}–${to} jaar`;
  if (hasValue(from)) return `Vanaf ${from} jaar`;
  if (hasValue(to)) return `Tot ${to} jaar`;
  return "";
}

const ITEM_STATUS_LABELS = {
  AVAILABLE: "Beschikbaar",
  MISSING: "Niet beschikbaar",
  ON_HOLD: "Gereserveerd",
};

function dateOnly(value) {
  const match = rawText(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : rawText(value);
}

function itemAvailability(status, returnDate) {
  if (!hasValue(status)) return "";

  const statusCode = rawText(status).trim().toUpperCase().replace(/[ -]+/g, "_");

  if (statusCode === "ON_LOAN") {
    return hasValue(returnDate) ? `Uitgeleend tot ${dateOnly(returnDate)}` : "Uitgeleend";
  }

  return ITEM_STATUS_LABELS[statusCode] || rawText(status);
}

const ENDPOINTS = {
  discovery: "/discovery/title/{titleId}",
  title: "/title/{titleId}",
  availability: "/branch/{branchId}/titleavailability/{titleId}?clientType=PUBLIC&holdsCount=true",
  items: "/title/{titleId}/iteminformation?branchId=1000&branchCatGroups=0&clientType=I",
  recommendations: "/title/{titleId}/recommended/title?limit=5&offset=0",
};

function downloadFile(filename, contents, mimeType) {
  const blob = new Blob([contents], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function RawValue({ value, empty = "—" }) {
  return <span className="raw-value">{hasValue(value) ? rawText(value) : empty}</span>;
}

function RawRows({ rows }) {
  return (
    <section className="specs-list">
      {rows.map((row) => (
        <div className="spec-row" key={row.key || row.label}>
          <div className="spec-label">{row.label}</div>
          <div className="spec-value"><RawValue value={row.value} /></div>
        </div>
      ))}
    </section>
  );
}

/**
 * ALL detail page.
 * The layout follows the OBA detail concepts while every displayed value remains raw OCLC data.
 */
export default function OclcDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [data, setData] = useState(null);
  const [tab, setTab] = useState("availability");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || !id) return;

    let cancelled = false;
    setData(null);
    setError("");

    fetch(`/api/oclc-detail?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error || `Request failed with status ${response.status}`);
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || "Onbekende fout");
      });

    return () => {
      cancelled = true;
    };
  }, [router.isReady, id]);

  const titleData = data?.title || {};
  const titleRecord = asArray(data?.titleInfo)[0] || {};
  const itemInformation = asArray(data?.itemInformation);
  const calls = asArray(data?.debug?.calls);
  const warnings = asArray(data?.warnings);

  const titleSource = firstSource([
    { value: titleData?.mainTitle, field: "mainTitle", endpoint: ENDPOINTS.discovery },
    { value: titleData?.title, field: "title", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.mainTitle, field: "[0].mainTitle", endpoint: ENDPOINTS.title },
    { value: titleRecord?.title, field: "[0].title", endpoint: ENDPOINTS.title },
  ]);
  const subtitleSource = firstSource([
    { value: titleData?.subtitle, field: "subtitle", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.subtitle, field: "[0].subtitle", endpoint: ENDPOINTS.title },
  ]);
  const volumeSource = firstSource([
    { value: titleData?.volume, field: "volume", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.volumeNumber, field: "[0].volumeNumber", endpoint: ENDPOINTS.title },
  ]);
  const volumeNameSource = firstSource([
    { value: titleData?.volumeTitle, field: "volumeTitle", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.volumeName, field: "[0].volumeName", endpoint: ENDPOINTS.title },
  ]);
  const authorSource = firstSource([
    { value: titleData?.author?.description, field: "author.description", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.author?.description, field: "[0].author.description", endpoint: ENDPOINTS.title },
    { value: titleRecord?.author, field: "[0].author", endpoint: ENDPOINTS.title },
  ]);
  const summarySource = firstSource([
    { value: titleData?.contents, field: "contents", endpoint: ENDPOINTS.discovery },
    { value: titleData?.contentsSchoolWise, field: "contentsSchoolWise", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.contents, field: "[0].contents", endpoint: ENDPOINTS.title },
    { value: titleRecord?.description, field: "[0].description", endpoint: ENDPOINTS.title },
  ]);
  const coverSource = firstSource([
    { value: titleData?.imageUrls?.large, field: "imageUrls.large", endpoint: ENDPOINTS.discovery },
    { value: titleData?.imageUrls?.medium, field: "imageUrls.medium", endpoint: ENDPOINTS.discovery },
    { value: titleData?.imageUrls?.small, field: "imageUrls.small", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.imageUrls?.large, field: "[0].imageUrls.large", endpoint: ENDPOINTS.title },
    { value: titleRecord?.imageUrls?.medium, field: "[0].imageUrls.medium", endpoint: ENDPOINTS.title },
    { value: titleRecord?.imageUrls?.small, field: "[0].imageUrls.small", endpoint: ENDPOINTS.title },
  ]);
  const isbnSource = firstSource([
    { value: titleData?.isbn, field: "isbn", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.isbn, field: "[0].isbn", endpoint: ENDPOINTS.title },
  ]);
  const ppnSource = firstSource([
    { value: titleData?.ppn, field: "ppn", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.ppn, field: "[0].ppn", endpoint: ENDPOINTS.title },
  ]);
  const publicationYearSource = firstSource([
    { value: titleData?.publicationYear, field: "publicationYear", endpoint: ENDPOINTS.discovery },
    { value: titleRecord?.publicationYear, field: "[0].publicationYear", endpoint: ENDPOINTS.title },
  ]);

  const volumeTitle = [volumeSource.value, volumeNameSource.value].filter(hasValue).join(", ");
  const titleParts = [
    titleSource.value,
    subtitleSource.value,
    volumeTitle,
  ].filter(hasValue);
  const combinedTitle = titleParts.join(" / ");

  const author = authorSource.value;
  const authorName = splitAuthorName(author);
  const summary = summarySource.value;
  const cover = coverSource.value;
  const targetAudience = targetAudienceLabel(titleRecord);
  const youthAgeRange = youthAgeRangeLabel(titleRecord, titleData?.ageRange);

  const languageProperty = firstReadableProperty(titleData?.language, ["description", "code"]);
  const language = firstReadableValue(titleData?.language, ["description", "code"]);
  const languageField = firstValueField("language", titleData?.language, languageProperty);
  const publisher = titleData?.imprint;

  const firstCallNumberIndex = itemInformation.findIndex((item) => hasValue(item?.callNumber));
  const firstCallNumber = firstCallNumberIndex >= 0 ? itemInformation[firstCallNumberIndex]?.callNumber : "";

  const collaborators = asArray(titleData?.collaborators);
  const firstCollaborator = collaborators[0] || {};
  const secondaryAuthorName = splitAuthorName(firstCollaborator?.description);

  const seriesProperty = firstReadableProperty(titleData?.titleSeries, ["description", "title", "name"]);
  const series = firstReadableValue(titleData?.titleSeries, ["description", "title", "name"]);
  const genreProperty = firstReadableProperty(titleData?.genre, ["description", "code"]);
  const genre = firstReadableValue(titleData?.genre, ["description", "code"]);
  const subjectProperty = firstReadableProperty(titleData?.subjects, ["description", "code"]);
  const subject = firstReadableValue(titleData?.subjects, ["description", "code"]);

  const availableLocations = useMemo(() => {
    const locations = itemInformation
      .filter((item) => String(item?.effectiveStatus || "").toUpperCase() === "AVAILABLE")
      .map((item) => item?.branchName || item?.branchId)
      .filter(hasValue);
    return [...new Set(locations)];
  }, [itemInformation]);

  const availabilitySummary = availableLocations.length
    ? `Beschikbaar in ${availableLocations.length} ${availableLocations.length === 1 ? "locatie" : "locaties"}`
    : titleData?.available === true
      ? "Beschikbaar"
      : titleData?.available === false
        ? "Niet beschikbaar"
        : "";

  const subjectRows = useMemo(() => asArray(titleData?.subjects)
    .map((entry, index) => {
      const property = firstReadableProperty(entry, ["description", "code"]);
      return {
        key: `subject-${index}`,
        label: "Onderwerp",
        value: firstReadableValue(entry, ["description", "code"]),
        field: `subjects[${index}]${property ? `.${property}` : ""}`,
        endpoint: ENDPOINTS.discovery,
        note: "Onderwerpen worden afzonderlijk als leesbare waarden getoond; de objectnotatie wordt niet weergegeven.",
      };
    })
    .filter((row) => hasValue(row.value)), [titleData]);

  const headlineRows = useMemo(() => [
    {
      label: "Beschikbaar in",
      value: availabilitySummary,
      field: availableLocations.length ? "[].effectiveStatus | [].branchName" : "available",
      endpoint: availableLocations.length ? ENDPOINTS.items : ENDPOINTS.discovery,
      note: availableLocations.length
        ? "Aantal unieke vestigingen met exemplaarstatus AVAILABLE."
        : "Geen beschikbare vestigingen in iteminformation; daarom is de ruwe titelstatus gebruikt.",
    },
  ].filter((row) => hasValue(row.value)), [availabilitySummary, availableLocations.length]);

  const topSpecificationRows = useMemo(() => [
    { label: "Algemene materiaalaanduiding", value: titleData?.media?.description, field: "media.description", endpoint: ENDPOINTS.discovery },
    {
      label: "Taal publicatie",
      value: language,
      field: languageField,
      endpoint: ENDPOINTS.discovery,
      note: "Bij meerdere talen wordt de eerste waarde gebruikt en zonder array- of objectnotatie getoond.",
    },
    {
      label: "Uitgever",
      value: publisher,
      field: "imprint",
      endpoint: ENDPOINTS.discovery,
      note: "De conceptuele veldnaam is Uitgever; de getoonde waarde blijft de ruwe OCLC-imprintwaarde.",
    },
    { label: "Collatie", value: titleData?.annotationCollation, field: "annotationCollation", endpoint: ENDPOINTS.discovery },
    {
      label: "Doelgroep",
      value: targetAudience,
      field: "[0].categoryYouth | [0].categoryAdult",
      endpoint: ENDPOINTS.title,
      note: "Doelgroep wordt bepaald met de jeugd- en volwassenenindicatoren van het eerste /title-record.",
    },
    {
      label: "Leeftijdsindicatie",
      value: youthAgeRange,
      field: "ageRange.from | ageRange.to",
      endpoint: ENDPOINTS.discovery,
      note: "Leeftijdsgrenzen worden alleen bij doelgroep Jeugd als één leesbare waarde getoond.",
    },
    { label: "Doelgroepomschrijving", value: titleData?.audience?.description, field: "audience.description", endpoint: ENDPOINTS.discovery },
  ].filter((row) => hasValue(row.value)), [language, languageField, publisher, targetAudience, titleData, youthAgeRange]);

  const practicalRows = useMemo(() => [
    {
      label: "ISBN Nummer",
      value: firstReadableValue(isbnSource.value),
      field: firstValueField(isbnSource.field, isbnSource.value),
      endpoint: isbnSource.endpoint,
      note: "Bij meerdere ISBN-nummers wordt de eerste waarde gebruikt.",
    },
    {
      label: "PPN Nummer",
      value: firstReadableValue(ppnSource.value),
      field: firstValueField(ppnSource.field, ppnSource.value),
      endpoint: ppnSource.endpoint,
      note: "Bij meerdere PPN-nummers wordt de eerste waarde gebruikt.",
    },
    {
      label: "Boekcode / plaatsingscode",
      value: firstCallNumber,
      field: firstCallNumberIndex >= 0 ? `[${firstCallNumberIndex}].callNumber` : "[].callNumber",
      endpoint: ENDPOINTS.items,
      note: "Bij meerdere exemplaren wordt de eerste aanwezige plaatsingscode gebruikt.",
    },
    {
      label: "Taal publicatie",
      value: language,
      field: languageField,
      endpoint: ENDPOINTS.discovery,
      note: "Bij meerdere talen wordt de eerste waarde gebruikt en zonder array- of objectnotatie getoond.",
    },
    { label: "Hoofdtitel", value: titleSource.value, field: titleSource.field, endpoint: titleSource.endpoint },
    { label: "Algemene materiaalaanduiding", value: titleData?.media?.description, field: "media.description", endpoint: ENDPOINTS.discovery },
    { label: "Eerste verantwoordelijke", value: authorSource.value, field: authorSource.field, endpoint: authorSource.endpoint },
    {
      label: "Auteur Achternaam",
      value: authorName.lastName,
      field: authorSource.field,
      endpoint: authorSource.endpoint,
      note: "Achternaam uit de beschrijving van de eerste verantwoordelijke.",
    },
    {
      label: "Auteur Voornaam",
      value: authorName.firstName,
      field: authorSource.field,
      endpoint: authorSource.endpoint,
      note: "Voornaam uit de beschrijving van de eerste verantwoordelijke.",
    },
    { label: "Titel - Ondertitel", value: subtitleSource.value, field: subtitleSource.field, endpoint: subtitleSource.endpoint },
    {
      label: "Uitgever",
      value: publisher,
      field: "imprint",
      endpoint: ENDPOINTS.discovery,
      note: "De conceptuele veldnaam is Uitgever; de getoonde waarde blijft de ruwe OCLC-imprintwaarde.",
    },
    { label: "Jaar van uitgave", value: publicationYearSource.value, field: publicationYearSource.field, endpoint: publicationYearSource.endpoint },
    { label: "Collatie", value: titleData?.annotationCollation, field: "annotationCollation", endpoint: ENDPOINTS.discovery },
    { label: "Annotatie", value: titleData?.annotationNoMarc, field: "annotationNoMarc", endpoint: ENDPOINTS.discovery },
    { label: "Editie", value: titleData?.annotationEdition ?? titleData?.edition, field: hasValue(titleData?.annotationEdition) ? "annotationEdition" : "edition", endpoint: ENDPOINTS.discovery },
    { label: "Auteur Functie", value: titleData?.author?.addition, field: "author.addition", endpoint: ENDPOINTS.discovery },
    {
      label: "Auteur - secundaire - Functie",
      value: firstCollaborator?.addition,
      field: "collaborators[0].addition",
      endpoint: ENDPOINTS.discovery,
      note: "Bij meerdere secundaire auteurs wordt de eerste auteur gebruikt.",
    },
    {
      label: "Auteur - secundaire - Achternaam",
      value: secondaryAuthorName.lastName,
      field: "collaborators[0].description",
      endpoint: ENDPOINTS.discovery,
      note: "Achternaam uit de beschrijving van de eerste secundaire auteur.",
    },
    {
      label: "Auteur - secundaire - Voornaam",
      value: secondaryAuthorName.firstName,
      field: "collaborators[0].description",
      endpoint: ENDPOINTS.discovery,
      note: "Voornaam uit de beschrijving van de eerste secundaire auteur.",
    },
    {
      label: "Reeks",
      value: series,
      field: firstValueField("titleSeries", titleData?.titleSeries, seriesProperty),
      endpoint: ENDPOINTS.discovery,
      note: "Bij meerdere reeksen wordt de eerste leesbare waarde gebruikt.",
    },
    {
      label: "Genre",
      value: genre,
      field: firstValueField("genre", titleData?.genre, genreProperty),
      endpoint: ENDPOINTS.discovery,
      note: "Bij meerdere genres wordt de eerste leesbare waarde gebruikt.",
    },
    {
      label: "Trefwoord - hoofdgeleding",
      value: subject,
      field: firstValueField("subjects", titleData?.subjects, subjectProperty),
      endpoint: ENDPOINTS.discovery,
      note: "Bij meerdere onderwerpen wordt in de praktische specificaties de eerste leesbare waarde gebruikt; het Onderwerpenblok toont ze allemaal.",
    },
    { label: "Samenvatting - Tekst", value: summarySource.value, field: summarySource.field, endpoint: summarySource.endpoint },
  ].filter((row) => hasValue(row.value)), [authorName, authorSource, firstCallNumber, firstCallNumberIndex, firstCollaborator, genre, genreProperty, isbnSource, language, languageField, ppnSource, publicationYearSource, publisher, secondaryAuthorName, series, seriesProperty, subject, subjectProperty, subtitleSource, summarySource, titleData, titleSource]);

  const itemRows = useMemo(() => itemInformation.map((item, index) => ({
    key: `${item?.id ?? item?.barcode ?? "item"}-${index}`,
    location: item?.branchName,
    edition: titleData?.imprint,
    place: item?.callNumber,
    whereToFind: item?.shelfDescription,
    availability: itemAvailability(item?.effectiveStatus, item?.returnDate),
  })), [itemInformation, titleData]);

  const recommendationItems = useMemo(
    () => asArray(data?.recommendations?.items).slice(0, 5),
    [data]
  );

  const allOclc = useMemo(() => ({
    discoveryTitleResponse: data?.title ?? null,
    titleResponse: data?.titleInfo ?? null,
    titleAvailabilityResponse: data?.availability ?? null,
    itemInformationResponse: data?.itemInformation ?? null,
    recommendedTitlesResponse: data?.recommendations ?? null,
  }), [data]);

  const detailRows = useMemo(() => buildOclcDetailRows(data), [data]);

  const displayedFieldRows = useMemo(() => {
    const recommendationFieldRows = recommendationItems.flatMap((item, index) => [
      ["Aanbevolen titel", "title", item?.title],
      ["Auteur aanbevolen titel", "author", item?.author],
      ["Jaar aanbevolen titel", "publicationYear", item?.publicationYear],
      ["Materiaalcode aanbevolen titel", "medium.code", item?.medium?.code],
    ].map(([label, field, value]) => ({
      section: "Aanbevolen titels",
      label,
      field: `items[${index}].${field}`,
      value,
      endpoint: ENDPOINTS.recommendations,
    })));

    const rows = [
      {
        section: "Titel",
        label: "Samengestelde titel",
        field: [titleSource.field, subtitleSource.field, volumeSource.field, volumeNameSource.field].filter(Boolean).join(" | "),
        value: combinedTitle,
        endpoint: [titleSource.endpoint, subtitleSource.endpoint, volumeSource.endpoint, volumeNameSource.endpoint].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" | "),
        note: "Samengestelde weergavetitel uit hoofdtitel, ondertitel en eventuele deel-/volumewaarden.",
      },
      { section: "Auteur", label: "Eerste verantwoordelijke", field: authorSource.field, value: author, endpoint: authorSource.endpoint },
      { section: "Samenvatting", label: "Samenvatting", field: summarySource.field, value: summary, endpoint: summarySource.endpoint },
      { section: "Cover", label: "Cover", field: coverSource.field, value: cover, endpoint: coverSource.endpoint },
      ...headlineRows.map((row) => ({ section: "Beschikbaarheid", ...row })),
      ...topSpecificationRows.map((row) => ({ section: "Specificaties", ...row })),
      ...subjectRows.map((row) => ({ section: "Onderwerpen", ...row })),
      ...recommendationFieldRows,
      ...practicalRows.map((row) => ({ section: "Tab Praktische Informatie Specificatie", ...row })),
    ];

    itemRows.forEach((row, index) => {
      [
        ["Locatie", `[${index}].branchName`, row.location, ENDPOINTS.items, "Vestiging wordt op de detailpagina als Locatie getoond."],
        ["Uitgave", "imprint", row.edition, ENDPOINTS.discovery, "De ruwe OCLC-imprintwaarde wordt per exemplaar als Uitgave getoond."],
        ["Plaats", `[${index}].callNumber`, row.place, ENDPOINTS.items, "Boekcode / plaatsingscode wordt op de detailpagina als Plaats getoond."],
        ["Waar te vinden", `[${index}].shelfDescription`, row.whereToFind, ENDPOINTS.items, "Vindplaats wordt op de detailpagina als Waar te vinden getoond."],
        ["Beschikbaarheid", `[${index}].effectiveStatus | [${index}].returnDate`, row.availability, ENDPOINTS.items, "Statusvertaling: AVAILABLE = Beschikbaar, MISSING = Niet beschikbaar, ON_HOLD/ON HOLD = Gereserveerd en ON_LOAN = Uitgeleend tot [inleverdatum], zonder tijd."],
      ].forEach(([label, field, value, endpoint, note]) => rows.push({
        section: "Tab Praktische Informatie Beschikbaarheid Exemplarenniveau",
        label,
        field,
        value,
        endpoint,
        note,
      }));
    });

    return rows
      .filter((row) => hasValue(row.value))
      .map((row, index) => ({ ...row, order: index + 1 }));
  }, [author, authorSource, combinedTitle, cover, coverSource, headlineRows, itemRows, practicalRows, recommendationItems, subjectRows, subtitleSource, summary, summarySource, titleSource, topSpecificationRows, volumeNameSource, volumeSource]);

  if (error) return <div className="container">Fout: {error}</div>;
  if (!data) return <div className="container">Loading...</div>;

  return (
    <div className="page">
      <div className="header-image">
        <img src="/header.JPG" alt="OBA" />
      </div>

      <div className="container detail-page oclc-all-detail-page">
        {warnings.length ? (
          <div className="detail-warning" role="status">
            <strong>Niet alle WISE-informatie kon worden geladen.</strong>
            <ul>
              {warnings.map((warning, index) => (
                <li key={`${warning.source}-${index}`}>
                  {warning.source} ({warning.status || "onbekende status"})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="hero">
          <div className="hero-left">
            <h1 className="title">{combinedTitle || "Onbekende titel"}</h1>
            {hasValue(author) ? <div className="author-line"><RawValue value={author} /></div> : null}
            {hasValue(summary) ? <div className="summary-text"><RawValue value={summary} /></div> : null}

            {hasValue(availabilitySummary) ? (
              <div style={{ alignItems: "center", display: "flex", gap: "8px", margin: "22px 0" }}>
                <span
                  aria-hidden="true"
                  style={{
                    background: availableLocations.length || titleData?.available === true ? "#69ad79" : "#c44",
                    borderRadius: "50%",
                    display: "inline-block",
                    flex: "0 0 13px",
                    height: "13px",
                    width: "13px",
                  }}
                />
                <span>{availabilitySummary}</span>
              </div>
            ) : null}

            <div className="card-grid top-cards">
              <section className="info-card">
                <h2>Specificaties</h2>
                <dl className="raw-definition-list">
                  {topSpecificationRows.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd><RawValue value={row.value} /></dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="info-card">
                <h2>Onderwerpen</h2>
                {subjectRows.length ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {subjectRows.map((row) => (
                      <li key={row.key} style={{ marginBottom: "10px", textDecoration: "underline" }}>
                        <RawValue value={row.value} />
                      </li>
                    ))}
                  </ul>
                ) : <span>Geen onderwerpen beschikbaar</span>}
              </section>
            </div>
          </div>

          <div className="hero-right">
            {cover ? (
              <img src={cover} className="cover-large" alt={combinedTitle || "Cover"} />
            ) : (
              <div className="cover-placeholder">Geen cover</div>
            )}
          </div>
        </section>

        <section className="recommendations-section">
          <div className="section-header">
            <h2>Aanbevolen titels</h2>
          </div>

          {recommendationItems.length ? (
            <div className="recommendation-grid">
              {recommendationItems.map((item, index) => {
                const recommendationId = item?.id;
                const recommendationTitle = item?.title || `Aanbevolen titel ${index + 1}`;
                const recommendationMeta = [
                  item?.author,
                  item?.publicationYear,
                  item?.medium?.code,
                ].filter(hasValue);

                const content = (
                  <>
                    <h3><RawValue value={recommendationTitle} /></h3>
                    {recommendationMeta.length ? <p>{recommendationMeta.map(rawText).join(" · ")}</p> : null}
                  </>
                );

                return hasValue(recommendationId) ? (
                  <a
                    className="recommendation-card"
                    href={`/oclc-detail/${encodeURIComponent(recommendationId)}`}
                    key={`${recommendationId}-${index}`}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="recommendation-card" key={`recommendation-${index}`}>{content}</div>
                );
              })}
            </div>
          ) : (
            <div className="info-card">Geen aanbevolen titels beschikbaar</div>
          )}
        </section>

        <div className="section-header">
          <h2>Praktische informatie</h2>
          <div className="tab-buttons">
            <button type="button" className={tab === "specs" ? "tab-button active" : "tab-button"} onClick={() => setTab("specs")}>specificaties</button>
            <button type="button" className={tab === "availability" ? "tab-button active" : "tab-button"} onClick={() => setTab("availability")}>beschikbaarheid</button>
            <button type="button" className={tab === "displayed-fields" ? "tab-button active" : "tab-button"} onClick={() => setTab("displayed-fields")}>velden detailpagina</button>
            <button type="button" className={tab === "oclc" ? "tab-button active" : "tab-button"} onClick={() => setTab("oclc")}>alles oclc</button>
          </div>
        </div>

        {tab === "specs" ? <RawRows rows={practicalRows} /> : null}

        {tab === "availability" ? (
          <div className="availability-sections">
            <section className="table-card">
              <div className="table-wrap">
                <table className="detail-table raw-data-table">
                  <thead>
                    <tr>
                      <th>Locatie</th><th>Uitgave</th><th>Plaats</th><th>Waar te vinden</th><th>Beschikbaarheid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemRows.length ? itemRows.map((row) => (
                      <tr key={row.key}>
                        <td><RawValue value={row.location} /></td><td><RawValue value={row.edition} /></td>
                        <td><RawValue value={row.place} /></td><td><RawValue value={row.whereToFind} /></td>
                        <td><RawValue value={row.availability} /></td>
                      </tr>
                    )) : <tr><td colSpan="5">Geen iteminformation-response beschikbaar</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "displayed-fields" ? (
          <section className="table-card displayed-fields-table-card">
            <div className="all-oclc-summary">
              <strong>{displayedFieldRows.length} getoonde velden</strong>
              <span>In dezelfde conceptuele volgorde als op de detailpagina.</span>
            </div>
            <button
              type="button"
              className="tab-button"
              onClick={() => downloadFile(
                `oclc-detail-${id}-gebruikte-velden.csv`,
                toDisplayedFieldsCsv(displayedFieldRows),
                "text/csv;charset=utf-8;"
              )}
            >
              Download gebruikte velden CSV
            </button>
            <div className="table-wrap">
              <table className="detail-table displayed-fields-table">
                <thead>
                  <tr>
                    <th>Volgorde</th><th>Onderdeel</th><th>Getoonde veldnaam</th>
                    <th>OCLC-veldnaam</th><th>Waarde</th><th>Endpoint path</th><th>Opmerking</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedFieldRows.map((row) => (
                    <tr key={`${row.order}-${row.section}-${row.label}`}>
                      <td>{row.order}</td>
                      <td>{row.section}</td>
                      <td>{row.label}</td>
                      <td><code>{row.field}</code></td>
                      <td><span className="raw-table-value">{rawText(row.value)}</span></td>
                      <td><code>{row.endpoint}</code></td>
                      <td>{row.note || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "oclc" ? (
          <section className="table-card all-oclc-table-card">
            <div className="all-oclc-summary">
              <strong>{detailRows.length} ruwe velden</strong>
              <span>Alle velden uit de vijf OCLC-responses, inclusief lege en technische waarden.</span>
            </div>
            <button
              type="button"
              className="tab-button"
              onClick={() => downloadFile(
                `oclc-detail-${id}-alles-oclc.csv`,
                toOclcDetailCsv(detailRows),
                "text/csv;charset=utf-8;"
              )}
            >
              Download Alles OCLC CSV
            </button>
            <div className="table-wrap">
              <table className="detail-table all-oclc-table">
                <thead>
                  <tr>
                    <th>Veldnaam OCLC</th><th>Veldnaam site</th><th>OBA.nl IST</th>
                    <th>Endpoint path</th><th>Waarde</th><th>Opmerkingen</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row, index) => (
                    <tr key={`${row.endpoint}-${row.veldnaamOclc}-${index}`}>
                      <td><code>{row.veldnaamOclc}</code></td>
                      <td>{row.veldnaamSite}</td>
                      <td><span className={`mapping-status ${row.obaIst === "WEL" ? "mapping-status-yes" : "mapping-status-no"}`}>{row.obaIst}</span></td>
                      <td><code>{row.endpoint}</code></td>
                      <td><span className="raw-table-value">{row.waarde}</span></td>
                      <td>{row.opmerkingen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="debug-section">
          <button type="button" className="tab-button" onClick={() => downloadFile(`oclc-detail-${id}.json`, pretty(allOclc), "application/json;charset=utf-8;")}>Download OCLC JSON</button>{" "}
          <button
            type="button"
            className="tab-button"
            onClick={() => downloadFile(
              `oclc-detail-${id}-gebruikte-velden.csv`,
              toDisplayedFieldsCsv(displayedFieldRows),
              "text/csv;charset=utf-8;"
            )}
          >
            Gebruikte velden OCLC CSV
          </button>{" "}
          <button
            type="button"
            className="tab-button"
            onClick={() => downloadFile(
              `oclc-detail-${id}-alle-velden-oclc.csv`,
              toOclcDetailCsv(detailRows),
              "text/csv;charset=utf-8;"
            )}
          >
            Alle velden OCLC CSV
          </button>

          <details className="debug-block">
            <summary>OCLC API calls</summary>
            <div className="debug-content">
              {calls.length ? calls.map((call, index) => (
                <details className="debug-call" key={`${call?.url || "call"}-${index}`}>
                  <summary>{call?.url || "Onbekende call"} | {call?.status || "?"}</summary>
                  <pre>{pretty(call?.body ?? call)}</pre>
                </details>
              )) : <pre>Geen calls beschikbaar</pre>}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
