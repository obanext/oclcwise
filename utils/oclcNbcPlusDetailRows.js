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
  const description = firstText(
    record?.audience?.description,
    record?.targetAudience?.description,
    record?.targetGroup
  );
  const from = record?.ageRange?.from;
  const to = record?.ageRange?.to;
  const ageRange = hasValue(from) && hasValue(to)
    ? `${from}-${to} jaar`
    : hasValue(from)
      ? `Vanaf ${from} jaar`
      : hasValue(to)
        ? `Tot ${to} jaar`
        : "";

  if (description && ageRange) return `${description}: ${ageRange}`;
  if (description) return description;
  if (ageRange) return ageRange;
  if (record?.youth === true && record?.adult === true) return "Jeugd en volwassenen";
  if (record?.youth === true) return "Jeugd";
  if (record?.adult === true) return "Volwassenen";
  return "";
}

export function buildOclcNbcPlusViewModel(record = {}) {
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
  const genres = readableValues(record?.genre);
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
    loanName: text(loanLink?.name),
    format: firstText(record?.media?.description, record?.media?.icon),
    languages,
    publisher,
    edition: text(record?.annotationEdition),
    generalNote: text(record?.annotationGeneral),
    series,
    subjects,
    genres,
    subjectSourceField: asArray(record?.subjects).length ? "subjects[].description" : "subjectSchoolWise[].description",
    duration,
    collation,
    audience,
    publicationYear: text(record?.publicationYear),
    isbn,
    ppn,
  };
}

export function buildOclcNbcPlusUsedRows(record = {}, options = {}) {
  const view = buildOclcNbcPlusViewModel(record);
  const detailType = options.detailType === "ebook"
    ? "ebook"
    : options.detailType === "landelijk"
      ? "landelijk"
      : "luisterboek";
  const authorField = "author.description | author.qualifier | collaborators[].description | collaborators[].qualifier";
  const authorValue = view.authors.join(", ");
  const audienceField = "audience.description | targetAudience.description | targetGroup | ageRange.from | ageRange.to | youth | adult";
  const practicalRows = detailType === "landelijk"
    ? [
        ["Titel", "title", view.title, "Ruwe NBC+-titel."],
        ["Auteur", authorField, authorValue, "Eerste verantwoordelijke en eventuele medewerkers worden in de geleverde volgorde gecombineerd."],
        ["Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
        ["Editie", "annotationEdition", view.edition, "Ruwe editie."],
        ["Uitgave", hasValue(record?.publicationDetails) ? "publicationDetails" : "imprint", view.publisher, "publicationDetails heeft voorrang; de ruwe waarde wordt niet opgesplitst."],
        ["Collatie", "annotationCollation", view.collation, "De volledige ruwe collatiewaarde wordt getoond."],
        ["Formaat", "media.description", view.format, "Ruwe mediumomschrijving."],
        ["Doelgroep", audienceField, view.audience, "Ruwe doelgroepomschrijving en leeftijdsrange hebben voorrang; anders worden alleen expliciete jeugd-/volwassenenindicatoren gebruikt."],
        ["Serie", asArray(record?.titleSeries).length ? "titleSeries[].description" : "titleSeriesSchoolWise[].description", view.series, "Alle geleverde seriewaarden worden getoond."],
        ["Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond."],
        ["Genres", "genre[].description", view.genres, "Alle ruwe genreomschrijvingen worden getoond."],
        ["Publicatiejaar", "publicationYear", view.publicationYear, "Ruw publicatiejaar."],
        ["PPN", "ppn[]", view.ppn, "Alle PPN-waarden worden getoond."],
        ["ISBN", "isbn[]", view.isbn, "Alle ISBN-waarden worden getoond."],
      ]
    : detailType === "ebook"
    ? [
        ["Titel", "title", view.title, "Ruwe NBC+-titel."],
        ["Auteur", authorField, authorValue, "Eerste verantwoordelijke en eventuele medewerkers worden in de geleverde volgorde gecombineerd."],
        ["Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
        ["Formaat", "media.description", view.format, "Ruwe mediumomschrijving."],
        ["Doelgroep", audienceField, view.audience, "Ruwe doelgroepomschrijving en leeftijdsrange hebben voorrang; anders worden alleen expliciete jeugd-/volwassenenindicatoren gebruikt."],
        ["Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond."],
        ["Genres", "genre[].description", view.genres, "Alle ruwe genreomschrijvingen worden getoond."],
        ["PPN", "ppn[]", view.ppn, "Alle PPN-waarden worden getoond."],
        ["ISBN", "isbn[]", view.isbn, "Alle ISBN-waarden worden getoond."],
      ]
    : [
        ["Titel", "title", view.title, "Ruwe NBC+-titel."],
        ["Auteur", authorField, authorValue, "Eerste verantwoordelijke en eventuele medewerkers worden in de geleverde volgorde gecombineerd."],
        ["Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
        ["Editie", "annotationEdition", view.edition, "Ruwe editie."],
        ["Formaat", "media.description", view.format, "Ruwe mediumomschrijving."],
        ["Doelgroep", audienceField, view.audience, "Ruwe doelgroepomschrijving en leeftijdsrange hebben voorrang; anders worden alleen expliciete jeugd-/volwassenenindicatoren gebruikt."],
        ["Speelduur", "annotationCollation", view.duration, "Voor de zichtbare speelduur wordt de eerste waarde vóór de komma gebruikt; de volledige bronwaarde blijft in Alle velden OCLC beschikbaar."],
        ["Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond."],
        ["PPN", "ppn[]", view.ppn, "Alle PPN-waarden worden getoond."],
        ["ISBN", "isbn[]", view.isbn, "Alle ISBN-waarden worden getoond."],
      ];
  const rows = [
    ["Titel", "Titel", "title", view.title, "Ruwe NBC+-titel."],
    ["Auteur", "Eerste verantwoordelijke", "author.description | author.qualifier", view.author, "De auteursnaam blijft in de door NBC+ geleverde volgorde."],
    ["Samenvatting", "Samenvatting", hasValue(record?.contents) ? "contents" : "contentsSchoolWise", view.summary, "Ruwe samenvatting uit NBC+."],
    ["Cover", "Cover", "imageUrls.large | imageUrls.medium | imageUrls.small", view.cover, "Het grootste beschikbare coverformaat wordt gebruikt."],
    ["Beschikbaarheid", "Beschikbaarheid", "available", detailType === "landelijk" && view.available === true ? "Beschikbaar" : view.availabilityLabel, detailType === "landelijk" ? "De ruwe NBC+-beschikbaarheidswaarde wordt leesbaar getoond." : "true wordt visueel Digitaal beschikbaar; false wordt Niet beschikbaar."],
    ["Actie", detailType === "landelijk" ? (view.loanName || "Externe link") : "Digitaal te lenen", "externalLinks[].url", view.loanUrl, "De relevante link uit externalLinks wordt gebruikt."],
    ["Specificaties", "Formaat", "media.description", view.format, "Ruwe mediumomschrijving."],
    ["Specificaties", "Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
    ["Specificaties", "Uitgave", hasValue(record?.publicationDetails) ? "publicationDetails" : "imprint", view.publisher, "publicationDetails heeft voorrang; de ruwe waarde wordt niet opgesplitst."],
    ["Specificaties", "Serie", asArray(record?.titleSeries).length ? "titleSeries[].description" : "titleSeriesSchoolWise[].description", view.series, "Alle geleverde seriewaarden worden getoond."],
    ["Specificaties", "Doelgroep", "youth | adult", view.audience, "Alleen expliciete NBC+-indicatoren worden gebruikt; een ontbrekende doelgroep wordt niet afgeleid."],
    ["Onderwerpen", "Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond."],
    ...practicalRows.map(([label, field, value, note]) => ["Praktische informatie", label, field, value, note]),
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
  "genre[].description": "Genres",
  "audience.description": "Doelgroep",
  "targetAudience.description": "Doelgroep",
  targetGroup: "Doelgroep",
  "ageRange.from": "Doelgroep – vanaf leeftijd",
  "ageRange.to": "Doelgroep – tot leeftijd",
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

export function buildOclcNbcPlusAllRows(record = {}) {
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

export function toOclcNbcPlusUsedCsv(rows = []) {
  return toCsv(rows, [
    ["order", "Volgorde"], ["section", "Onderdeel"], ["label", "Getoonde veldnaam"],
    ["field", "OCLC-veldnaam"], ["value", "Waarde"], ["endpoint", "Endpoint path"],
    ["note", "Opmerking"],
  ]);
}

export function toOclcNbcPlusAllCsv(rows = []) {
  return toCsv(rows, [
    ["veldnaamOclc", "Veldnaam OCLC"], ["veldnaamSite", "Veldnaam site"],
    ["obaIst", "OBA.nl IST"], ["endpoint", "Endpoint path"], ["waarde", "Waarde"],
    ["opmerkingen", "Opmerkingen"],
  ]);
}
