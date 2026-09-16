export const NBCPLUS_AUDIOBOOK_ENDPOINT = "/discovery/origin/nbcplus/branch/{branchId}/title/{ppn}";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const hasValue = (value) => value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);

const rawText = (value) => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const text = (value) => value === null || value === undefined ? "" : String(value).trim();
const firstText = (...values) => values.map(text).find(Boolean) || "";

const readableValues = (value, keys = ["description", "code"]) => asArray(value)
  .map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const key = keys.find((candidate) => hasValue(entry?.[candidate]));
    return key ? entry[key] : "";
  })
  .filter(hasValue);

function personLabel(person = {}) {
  if (!hasValue(person?.description)) return "";
  return hasValue(person?.qualifier)
    ? `${person.description} (${person.qualifier})`
    : person.description;
}

function escapeCsv(value) {
  return `"${rawText(value).replace(/"/g, '""')}"`;
}

function toCsv(rows, columns) {
  return `\uFEFF${[
    columns.map(([, label]) => escapeCsv(label)).join(";"),
    ...rows.map((row) => columns.map(([key]) => escapeCsv(
      Array.isArray(row?.[key]) ? row[key].map(rawText).join(" | ") : row?.[key]
    )).join(";")),
  ].join("\r\n")}`;
}

function targetAudience(record = {}) {
  if (record?.youth === true && record?.adult === true) return "Jeugd en volwassenen";
  if (record?.youth === true) return "Jeugd";
  if (record?.adult === true) return "Volwassenen";
  return "";
}

export function buildOclcAudiobookViewModel(record = {}) {
  const collaborators = asArray(record?.collaborators);
  const primaryAuthor = personLabel(record?.author);
  const collaboratorValues = collaborators.map(personLabel).filter(Boolean);
  const authors = [primaryAuthor, ...collaboratorValues].filter(Boolean);
  const languages = readableValues(record?.language);
  const series = readableValues(
    asArray(record?.titleSeries).length ? record.titleSeries : record?.titleSeriesSchoolWise
  );
  const subjectSource = asArray(record?.subjects).length ? record.subjects : record?.subjectSchoolWise;
  const subjects = readableValues(subjectSource);
  const isbn = asArray(record?.isbn).map(rawText).filter(Boolean);
  const ppn = asArray(record?.ppn).map(rawText).filter(Boolean);
  const collation = text(record?.annotationCollation);
  const duration = collation.split(",")[0].trim();
  const loanLink = asArray(record?.externalLinks).find((link) => (
    rawText(link?.id).includes("digitalloan") || rawText(link?.name).toLowerCase().includes("online bibliotheek")
  )) || asArray(record?.externalLinks)[0] || null;
  const publisher = firstText(record?.publicationDetails, record?.imprint);
  const cover = firstText(record?.imageUrls?.large, record?.imageUrls?.medium, record?.imageUrls?.small);
  const audience = targetAudience(record);

  return {
    title: firstText(record?.mainTitle, record?.title),
    author: primaryAuthor,
    authors,
    collaborators: collaboratorValues,
    summary: firstText(record?.contents, record?.contentsSchoolWise),
    cover,
    available: record?.available,
    availabilityLabel: record?.available === true ? "Digitaal beschikbaar" : record?.available === false ? "Niet beschikbaar" : "",
    loanUrl: text(loanLink?.url),
    loanName: firstText(loanLink?.name, "Digitaal te lenen"),
    format: firstText(record?.media?.description, record?.media?.icon),
    languages,
    publisher,
    edition: text(record?.annotationEdition),
    generalNote: text(record?.annotationGeneral),
    series,
    subjects,
    subjectSourceField: asArray(record?.subjects).length ? "subjects[].description" : "subjectSchoolWise[].description",
    duration,
    collation,
    audience,
    publicationYear: text(record?.publicationYear),
    isbn,
    ppn,
  };
}

export function buildOclcAudiobookUsedRows(record = {}) {
  const view = buildOclcAudiobookViewModel(record);
  const rows = [
    ["Titel", "Titel", "title", view.title, "Ruwe NBC+-titel."],
    ["Auteur", "Eerste verantwoordelijke", "author.description | author.qualifier", view.author, "De auteursnaam blijft in de door NBC+ geleverde volgorde."],
    ["Samenvatting", "Samenvatting", hasValue(record?.contents) ? "contents" : "contentsSchoolWise", view.summary, "Ruwe samenvatting uit NBC+."],
    ["Cover", "Cover", "imageUrls.large | imageUrls.medium | imageUrls.small", view.cover, "Het grootste beschikbare coverformaat wordt gebruikt."],
    ["Beschikbaarheid", "Beschikbaarheid", "available", view.availabilityLabel, "true wordt visueel Digitaal beschikbaar; false wordt Niet beschikbaar."],
    ["Actie", "Digitaal te lenen", "externalLinks[].url", view.loanUrl, "De link met id availability~nbc~digitalloan heeft voorrang."],
    ["Specificaties", "Formaat", "media.description", view.format, "Ruwe mediumomschrijving."],
    ["Specificaties", "Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
    ["Specificaties", "Uitgave", hasValue(record?.publicationDetails) ? "publicationDetails" : "imprint", view.publisher, "publicationDetails heeft voorrang; de ruwe waarde wordt niet opgesplitst."],
    ["Specificaties", "Serie", asArray(record?.titleSeries).length ? "titleSeries[].description" : "titleSeriesSchoolWise[].description", view.series, "Alle geleverde seriewaarden worden getoond."],
    ["Specificaties", "Doelgroep", "youth | adult", view.audience, "Alleen expliciete NBC+-indicatoren worden gebruikt; een ontbrekende doelgroep wordt niet afgeleid."],
    ["Onderwerpen", "Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond."],
    ["Praktische informatie", "Editie", "annotationEdition", view.edition, "Ruwe editie."],
    ["Praktische informatie", "Noot", "annotationGeneral", view.generalNote, "Ruwe algemene noot."],
    ["Praktische informatie", "Speelduur", "annotationCollation", view.duration, "Voor de zichtbare speelduur wordt de eerste waarde vóór de komma gebruikt; de volledige bronwaarde blijft in Alle velden OCLC beschikbaar."],
    ["Praktische informatie", "Publicatiejaar", "publicationYear", view.publicationYear, "Ruw publicatiejaar."],
    ["Praktische informatie", "PPN", "ppn[]", view.ppn, "Alle PPN-waarden worden getoond."],
    ["Praktische informatie", "ISBN", "isbn[]", view.isbn, "Alle ISBN-waarden worden getoond."],
  ];

  return rows
    .filter(([, , , value]) => hasValue(value))
    .map(([section, label, field, value, note], index) => ({
      order: index + 1,
      section,
      label,
      field,
      value,
      endpoint: NBCPLUS_AUDIOBOOK_ENDPOINT,
      note,
    }));
}

const siteNames = {
  id: "NBC+-titel-ID",
  title: "Titel",
  "author.description": "Eerste verantwoordelijke",
  contents: "Samenvatting",
  "media.description": "Formaat",
  "isbn[]": "ISBN",
  "imageUrls.small": "Cover-URL klein",
  "imageUrls.medium": "Cover-URL middel",
  "imageUrls.large": "Cover-URL groot",
  "language[].description": "Taal",
  publicationYear: "Publicatiejaar",
  "collaborators[].description": "Medewerker",
  "titleSeries[].description": "Serie",
  "titleSeriesSchoolWise[].description": "Serie SchoolWise",
  "subjectSchoolWise[].description": "Onderwerpen",
  "subjects[].description": "Onderwerpen",
  "ppn[]": "PPN",
  available: "Beschikbaarheid",
  annotationEdition: "Editie",
  publicationDetails: "Uitgave",
  annotationGeneral: "Noot",
  annotationCollation: "Speelduur / collatie",
  "externalLinks[].url": "Digitaal lenen",
};

const obaFields = new Set(Object.keys(siteNames));

function normalizePath(path) {
  return path.replace(/\[\d+\]/g, "[]");
}

function flatten(value, path = "", rows = []) {
  if (Array.isArray(value)) {
    if (!value.length) rows.push({ path, value: "[]" });
    value.forEach((entry, index) => flatten(entry, `${path}[${index}]`, rows));
    return rows;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) rows.push({ path, value: "{}" });
    entries.forEach(([key, entry]) => flatten(entry, path ? `${path}.${key}` : key, rows));
    return rows;
  }
  rows.push({ path: path || "(response)", value: rawText(value) });
  return rows;
}

export function buildOclcAudiobookAllRows(record = {}) {
  return flatten(record).map((row) => {
    const normalized = normalizePath(row.path);
    const isOba = obaFields.has(normalized);
    return {
      veldnaamOclc: row.path,
      veldnaamSite: siteNames[normalized] || "",
      obaIst: isOba ? "WEL" : "NIET",
      endpoint: NBCPLUS_AUDIOBOOK_ENDPOINT,
      waarde: row.value,
      opmerkingen: isOba
        ? "Conceptuele tegenhanger op de detailpagina; de ruwe NBC+-waarde blijft beschikbaar."
        : "Ruw NBC+-veld zonder vastgestelde zichtbare tegenhanger.",
    };
  });
}

export function toOclcAudiobookUsedCsv(rows = []) {
  return toCsv(rows, [
    ["order", "Volgorde"], ["section", "Onderdeel"], ["label", "Getoonde veldnaam"],
    ["field", "OCLC-veldnaam"], ["value", "Waarde"], ["endpoint", "Endpoint path"],
    ["note", "Opmerking"],
  ]);
}

export function toOclcAudiobookAllCsv(rows = []) {
  return toCsv(rows, [
    ["veldnaamOclc", "Veldnaam OCLC"], ["veldnaamSite", "Veldnaam site"],
    ["obaIst", "OBA.nl IST"], ["endpoint", "Endpoint path"], ["waarde", "Waarde"],
    ["opmerkingen", "Opmerkingen"],
  ]);
}
