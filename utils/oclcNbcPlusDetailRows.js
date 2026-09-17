export const NBCPLUS_DETAIL_ENDPOINT = "/discovery/origin/nbcplus/branch/{branchId}/title/{ppn}";

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

const PERSPECTIVE_IDS = {
  ebook: "3684",
  luisterboek: "3685",
  landelijk: "3687",
};

// NBC+ detailrecords gebruiken deels andere mediacodes dan het
// mediumTypeCode-facet. Deze aliases volgen data/wise/mediumtypecode.txt.
const MEDIUM_TYPE_CODE_ALIASES = {
  AUDIOBOOK: "ORA",
  BOOK: "BOE",
  CD: "CDS",
  EBOOK: "ORB",
};

function mediumTypeFacetCode(record = {}) {
  const rawCode = firstText(record?.media?.code, record?.media?.icon).toUpperCase();
  return MEDIUM_TYPE_CODE_ALIASES[rawCode] || rawCode;
}

function facetSearchHref(detailType, facetName, facetValue) {
  if (!hasValue(facetName) || !hasValue(facetValue)) return "";

  const params = new URLSearchParams({
    page: "1",
    perspectiveId: PERSPECTIVE_IDS[detailType] || PERSPECTIVE_IDS.landelijk,
    searchScope: "anything",
    sort: "2910",
  });
  params.append("facetFilter", `${facetName}:${facetValue}`);
  return `/oclc-search?${params.toString()}`;
}

function termSearchHref(detailType, term) {
  if (!hasValue(term)) return "";

  const params = new URLSearchParams({
    term: String(term),
    page: "1",
    perspectiveId: PERSPECTIVE_IDS[detailType] || PERSPECTIVE_IDS.landelijk,
    searchScope: "anything",
    sort: "2910",
  });
  return `/oclc-search?${params.toString()}`;
}

function termFilterSearchHref(detailType, fieldName, fieldValue) {
  if (!hasValue(fieldName) || !hasValue(fieldValue)) return "";

  const params = new URLSearchParams({
    page: "1",
    perspectiveId: PERSPECTIVE_IDS[detailType] || PERSPECTIVE_IDS.landelijk,
    searchScope: "anything",
    sort: "2910",
  });
  params.append("termFilter", `${fieldName}:${fieldValue}`);
  return `/oclc-search?${params.toString()}`;
}

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

function publisherName(record = {}) {
  const publicationDetails = text(record?.publicationDetails);
  if (publicationDetails) return publicationDetails.split(",")[0].trim();

  const imprint = text(record?.imprint);
  if (!imprint) return "";
  const publisherPart = imprint.includes(":") ? imprint.split(":").slice(1).join(":") : imprint;
  return publisherPart.split(",")[0].trim();
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
  const publisher = publisherName(record);
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
  const audienceField = "audience.description | targetAudience.description | targetGroup | ageRange.from | ageRange.to | youth | adult";
  const authorHref = termSearchHref(detailType, record?.author?.description);
  const authorSources = [record?.author, ...asArray(record?.collaborators)]
    .filter((entry) => hasValue(entry?.description));
  const authorHrefs = authorSources.map((entry) => termSearchHref(detailType, entry.description));
  const formatFacetCode = mediumTypeFacetCode(record);
  const formatHref = facetSearchHref(detailType, "mediumTypeCode", formatFacetCode);
  const languageHrefs = asArray(record?.language)
    .filter((entry) => hasValue(entry?.description || entry?.code))
    .map((entry) => facetSearchHref(detailType, "languageCode", entry?.code || entry?.description));
  const audienceCode = firstText(
    record?.audience?.code,
    record?.targetAudience?.code,
    record?.youth === true && record?.adult !== true ? "JN" : "",
    record?.adult === true && record?.youth !== true ? "NJ" : ""
  );
  const audienceHref = facetSearchHref(detailType, "audienceCode", audienceCode);
  const publicationYearHref = facetSearchHref(detailType, "customPublicationYear", view.publicationYear);
  const publisherHref = termFilterSearchHref(detailType, "publisher", view.publisher);
  const seriesSource = (asArray(record?.titleSeries).length ? asArray(record.titleSeries) : asArray(record?.titleSeriesSchoolWise))
    .filter((entry) => hasValue(entry?.description));
  const seriesHrefs = seriesSource.map((entry) => termSearchHref(detailType, entry.description));
  const subjectSource = (asArray(record?.subjects).length ? asArray(record.subjects) : asArray(record?.subjectSchoolWise))
    .filter((entry) => hasValue(entry?.description || entry?.code));
  const subjectHrefs = subjectSource.map((entry) => termSearchHref(detailType, entry?.description || entry?.code));
  const genreSource = asArray(record?.genre).filter((entry) => hasValue(entry?.description || entry?.code));
  const genreHrefs = genreSource.map((entry) => facetSearchHref(detailType, "genreCode", entry?.code || entry?.description));
  const titleField = hasValue(record?.mainTitle) ? "mainTitle" : "title";
  const formatField = hasValue(record?.media?.description) ? "media.description" : "media.icon";
  const publisherField = hasValue(record?.publicationDetails) ? "publicationDetails" : "imprint";
  const seriesField = asArray(record?.titleSeries).length ? "titleSeries[].description" : "titleSeriesSchoolWise[].description";
  const topSpecificationRows = [
    ["Formaat", formatField, view.format, `Ruwe mediumomschrijving; de zoeklink gebruikt de bijbehorende OCLC mediumTypeCode ${formatFacetCode}.`],
    ["Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
    ["Uitgever", publisherField, view.publisher, "Uit publicationDetails wordt de uitgeversnaam vóór de eerste komma getoond; bij imprint wordt de uitgeversnaam na de dubbele punt gebruikt."],
    ...(detailType === "landelijk"
      ? [["Reeks", seriesField, view.series, "Alle geleverde reekswaarden worden getoond en linken als brede termzoekopdracht binnen het landelijke perspective."]]
      : []),
    ["Doelgroep", audienceField, view.audience, "Ruwe doelgroepomschrijving en leeftijdsrange hebben voorrang; anders worden expliciete jeugd-/volwassenenindicatoren gebruikt."],
  ];
  const practicalRows = detailType === "landelijk"
    ? [
        ["Titel", titleField, view.title, "Ruwe NBC+-titel."],
        ["Auteurs", authorField, view.authors, "Eerste verantwoordelijke en medewerkers worden afzonderlijk getoond en linken via term=<waarde>&searchScope=anything."],
        ["Formaat", formatField, view.format, `Ruwe mediumomschrijving; de zoeklink gebruikt de bijbehorende OCLC mediumTypeCode ${formatFacetCode}.`],
        ["Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond. Iedere waarde linkt via term=<waarde>&searchScope=anything."],
        ["Genres", "genre[].description", view.genres, "Alle ruwe genreomschrijvingen worden getoond."],
        ["Doelgroep", audienceField, view.audience, "Ruwe doelgroepomschrijving en leeftijdsrange hebben voorrang; anders worden expliciete jeugd-/volwassenenindicatoren gebruikt."],
        ["Reeks", seriesField, view.series, "Alle geleverde reekswaarden worden getoond en linken via term=<waarde>&searchScope=anything."],
        ["ISBN", "isbn[]", view.isbn, "Alle ISBN-waarden worden getoond."],
        ["PPN", "ppn[]", view.ppn, "Alle PPN-waarden worden getoond."],
        ["Jaar van uitgave", "publicationYear", view.publicationYear, "Ruw publicatiejaar; de zoeklink gebruikt facetFilter=customPublicationYear:<jaar>."],
      ]
    : detailType === "ebook"
    ? [
        ["Titel", titleField, view.title, "Ruwe NBC+-titel."],
        ["Auteur", authorField, view.authors, "Eerste verantwoordelijke en medewerkers worden afzonderlijk getoond en linken via term=<waarde>&searchScope=anything."],
        ["Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
        ["Formaat", formatField, view.format, `Ruwe mediumomschrijving; de zoeklink gebruikt de bijbehorende OCLC mediumTypeCode ${formatFacetCode}.`],
        ["Doelgroep", audienceField, view.audience, "Ruwe doelgroepomschrijving en leeftijdsrange hebben voorrang; anders worden expliciete jeugd-/volwassenenindicatoren gebruikt."],
        ["Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond. Iedere waarde linkt via term=<waarde>&searchScope=anything."],
        ["Genres", "genre[].description", view.genres, "Alle ruwe genreomschrijvingen worden getoond."],
        ["PPN", "ppn[]", view.ppn, "Alle PPN-waarden worden getoond."],
        ["ISBN", "isbn[]", view.isbn, "Alle ISBN-waarden worden getoond."],
      ]
    : [
        ["Titel", titleField, view.title, "Ruwe NBC+-titel."],
        ["Auteur", authorField, view.authors, "Eerste verantwoordelijke en medewerkers worden afzonderlijk getoond en linken via term=<waarde>&searchScope=anything."],
        ["Taal", "language[].description", view.languages, "Alle taalbeschrijvingen worden getoond."],
        ["Formaat", formatField, view.format, `Ruwe mediumomschrijving; de zoeklink gebruikt de bijbehorende OCLC mediumTypeCode ${formatFacetCode}.`],
        ["Doelgroep", audienceField, view.audience, "Ruwe doelgroepomschrijving en leeftijdsrange hebben voorrang; anders worden expliciete jeugd-/volwassenenindicatoren gebruikt."],
        ["Speelduur", "annotationCollation", view.duration, "Voor de zichtbare speelduur wordt de eerste waarde vóór de komma gebruikt; de volledige bronwaarde blijft in Alle velden OCLC beschikbaar."],
        ["Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond. Iedere waarde linkt via term=<waarde>&searchScope=anything."],
        ["PPN", "ppn[]", view.ppn, "Alle PPN-waarden worden getoond."],
        ["ISBN", "isbn[]", view.isbn, "Alle ISBN-waarden worden getoond."],
      ];
  const rows = [
    ["Titel", "Titel", "title", view.title, "Ruwe NBC+-titel."],
    ["Auteur", "Eerste verantwoordelijke", "author.description | author.qualifier", view.author, "De auteursnaam blijft in de door NBC+ geleverde volgorde en linkt via term=<waarde>&searchScope=anything."],
    ["Samenvatting", "Samenvatting", hasValue(record?.contents) ? "contents" : "contentsSchoolWise", view.summary, "Ruwe samenvatting uit NBC+."],
    ["Cover", "Cover", "imageUrls.large | imageUrls.medium | imageUrls.small", view.cover, "Het grootste beschikbare coverformaat wordt gebruikt."],
    ["Beschikbaarheid", "Beschikbaarheid", "available", detailType === "landelijk" && view.available === true ? "Beschikbaar" : view.availabilityLabel, detailType === "landelijk" ? "De ruwe NBC+-beschikbaarheidswaarde wordt leesbaar getoond." : "true wordt visueel Digitaal beschikbaar; false wordt Niet beschikbaar."],
    ["Actie", detailType === "landelijk" ? (view.loanName || "Externe link") : "Digitaal te lenen", "externalLinks[].url", view.loanUrl, "De relevante link uit externalLinks wordt gebruikt."],
    ...topSpecificationRows.map(([label, field, value, note]) => ["Specificaties", label, field, value, note]),
    ["Onderwerpen", "Onderwerpen", view.subjectSourceField, view.subjects, "subjects heeft voorrang; anders worden subjectSchoolWise-waarden getoond. Iedere waarde linkt via term=<waarde>&searchScope=anything."],
    ...practicalRows.map(([label, field, value, note]) => ["Praktische informatie", label, field, value, note]),
  ];

  return rows
    .filter(([, , , value]) => hasValue(value))
    .map(([section, label, field, value, note], index) => {
      const href = label === "Eerste verantwoordelijke"
        ? authorHref
        : label === "Formaat"
          ? formatHref
          : label === "Uitgever"
            ? publisherHref
        : label === "Doelgroep"
          ? audienceHref
          : label === "Jaar van uitgave"
            ? publicationYearHref
          : "";
      const hrefs = label === "Auteur" || label === "Auteurs"
        ? authorHrefs
        : label === "Taal"
          ? languageHrefs
        : label === "Serie" || label === "Reeks"
        ? seriesHrefs
        : label === "Onderwerpen"
          ? subjectHrefs
          : label === "Genres"
            ? genreHrefs
            : [];

      return {
        order: index + 1,
        section,
        label,
        field,
        value,
        endpoint: NBCPLUS_DETAIL_ENDPOINT,
        href,
        hrefs,
        searchLink: href || hrefs.filter(Boolean).join(" | "),
        note: (href || hrefs.some(Boolean))
          ? `${note} De zichtbare waarde linkt naar OCLC zoeken binnen perspective ${PERSPECTIVE_IDS[detailType]}.`
          : note,
      };
    });
}

const siteNames = {
  id: "NBC+-titel-ID",
  title: "Titel",
  mainTitle: "Titel",
  "author.description": "Eerste verantwoordelijke",
  "author.qualifier": "Eerste verantwoordelijke – toevoeging",
  contents: "Samenvatting",
  "media.description": "Formaat",
  "media.icon": "Formaat",
  "isbn[]": "ISBN",
  "imageUrls.small": "Cover-URL klein",
  "imageUrls.medium": "Cover-URL middel",
  "imageUrls.large": "Cover-URL groot",
  "language[].description": "Taal",
  publicationYear: "Publicatiejaar",
  "collaborators[].description": "Medewerker",
  "collaborators[].qualifier": "Medewerker – toevoeging",
  "titleSeries[].description": "Serie",
  "titleSeriesSchoolWise[].description": "Serie SchoolWise",
  "subjectSchoolWise[].description": "Onderwerpen",
  "subjects[].description": "Onderwerpen",
  "genre[].description": "Genres",
  "genre[].code": "Genres – zoekcode",
  "audience.description": "Doelgroep",
  "audience.code": "Doelgroep – zoekcode",
  "targetAudience.description": "Doelgroep",
  "targetAudience.code": "Doelgroep – zoekcode",
  targetGroup: "Doelgroep",
  "ageRange.from": "Doelgroep – vanaf leeftijd",
  "ageRange.to": "Doelgroep – tot leeftijd",
  youth: "Doelgroep jeugd",
  adult: "Doelgroep volwassenen",
  "ppn[]": "PPN",
  available: "Beschikbaarheid",
  annotationEdition: "Editie",
  publicationDetails: "Uitgever",
  imprint: "Uitgever",
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
      endpoint: NBCPLUS_DETAIL_ENDPOINT,
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
    ["searchLink", "Zoeklink"], ["note", "Opmerking"],
  ]);
}

export function toOclcNbcPlusAllCsv(rows = []) {
  return toCsv(rows, [
    ["veldnaamOclc", "Veldnaam OCLC"], ["veldnaamSite", "Veldnaam site"],
    ["obaIst", "OBA.nl IST"], ["endpoint", "Endpoint path"], ["waarde", "Waarde"],
    ["opmerkingen", "Opmerkingen"],
  ]);
}
