// Normalize OCLC fields that can be singleton or array.
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// Convert optional API values to safe contract text.
const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

// Return the first non-empty text value from possible OCLC source fields.
const firstText = (...values) => values.map(text).find(Boolean) || "";

// Public mapper for IST detail.
// Input: OCLC detail responses.
// Output: mapped JSON in the current OBA/GB detail contract shape.
export function mapWiseToObaFull({ title, titleInfo, availability, itemInformation }) {
  if (!title || typeof title !== "object") return {};

  const titleRecord = asArray(titleInfo)[0] || {};
  const author = title.author || {};
  const collaborators = asArray(title.collaborators);
  const subjects = asArray(title.subjects);
  const genres = asArray(title.genre);
  const isbn = asArray(title.isbn).map(text).filter(Boolean);
  const ppn = asArray(title.ppn).map(text).filter(Boolean);
  const language = asArray(title.language)[0] || {};
  const series = asArray(title.titleSeries)[0] || {};
  const collation = parseCollation(title.annotationCollation);
  const imprint = parseImprint(title.imprint);
  const authorName = parseName(author.description);
  const nbd = extractLid(titleRecord.momkeys) || extractLid(title.imageUrls?.medium) || extractLid(title.imageUrls?.large);
  const bookCode = firstItemValue(itemInformation, "callNumber") || firstItemValue(itemInformation, "headWord") || firstLocalCallNumber(title);

  const output = {
    _attributes: {
      version: "",
      "before-rendering-time": "",
      "total-time": "",
      "detail-level": "",
    },

    meta: {
      rctx: { _text: "" },
    },

    id: {
      _attributes: {
        nativeid: text(title.id),
        ds: "",
        translation: "ID",
        "search-method": "id",
        "search-term": text(title.id),
        "search-type": "precise",
      },
      _text: text(title.id),
    },

    frabl: buildFrabl(title),

    "detail-page": {
      _text: text(title.id) ? `/oba-detail/${encodeURIComponent(text(title.id))}` : "",
    },

    coverimages: {
      coverimage: {
        _attributes: { translation: "Cover" },
        _text: text(title.imageUrls?.medium || title.imageUrls?.large || title.imageUrls?.small),
      },
    },

    titles: {
      title: {
        _attributes: {
          translation: "Titel",
          "search-method": "title",
          "search-term": text(title.title || title.mainTitle),
          "search-type": "fuzzy",
        },
        _text: text(title.title || title.mainTitle),
      },
      "short-title": {
        _attributes: { translation: "Korte titel" },
        _text: text(title.mainTitle || title.title),
      },
    },

    authors: buildAuthors(author, authorName, collaborators),

    formats: {
      format: {
        _attributes: {
          translation: "Formaat",
          "search-method": "format",
          "search-term": text(title.media?.code || title.media?.description),
          "search-type": "searcher",
          raw: text(title.media?.code),
        },
        _text: text(title.media?.description),
      },
    },

    identifiers: buildIdentifiers(isbn, ppn, titleRecord),

    publication: buildPublication(title, titleRecord, imprint),

    languages: {
      language: {
        _attributes: {
          translation: "Taal",
          "search-method": "language",
          "search-term": text(language.code),
          "search-type": "searcher",
          raw: text(language.code),
        },
        _text: text(language.description),
      },
    },

    subjects: {
      "topical-subject": repeatable(subjects.map((subject) => ({
        _attributes: {
          translation: "Onderwerp",
          "search-method": "subject",
          "search-term": text(subject.description),
          "search-type": "fuzzy,precise",
        },
        _text: text(subject.description),
      }))),
    },

    genres: buildGenres(genres),

    description: {
      pages: {
        _attributes: { translation: "Pagina's" },
        _text: collation.pages,
      },
      "physical-description": {
        _attributes: { translation: "Kenmerken" },
        _text: collation.full,
      },
    },

    summaries: {
      summary: {
        _attributes: { translation: "Samenvatting" },
        _text: text(title.contents || titleRecord.description),
      },
    },

    "target-audiences": buildTargetAudiences(title),

    ratings: {},

    "librarian-info": {
      _attributes: { translation: "Informatie voor bibliothecarissen" },
      info: {
        _attributes: {
          "import-time": "",
          material: text(title.media?.code),
          language: text(language.code),
          debug: "",
        },
      },
      record: {
        marc: buildMarc({
          title,
          titleRecord,
          author,
          authorName,
          collaborators,
          subjects,
          genres,
          language,
          series,
          isbn,
          ppn,
          imprint,
          collation,
          nbd,
          bookCode,
        }),
        meta: {
          branches: buildBranches(itemInformation),
        },
      },
    },

    "undup-info": buildUndupInfo(title, author),

    custom: {},
    branches: buildTopBranches(itemInformation),
    services: {},
  };

  output["librarian-info"].record["undup-info"] = buildUndupInfo(title, author);

  if (hasSeries(series)) {
    output.series = buildSeries(series);
  }

  return output;
}

// Preserve the current contract shape: one value as object, multiple values as array.
function repeatable(items) {
  const filtered = asArray(items).filter(hasTextDeep);
  if (filtered.length === 1) return filtered[0];
  return filtered;
}

// Check whether a contract node contains any visible text.
function hasTextDeep(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return Boolean(text(value));
  if (Array.isArray(value)) return value.some(hasTextDeep);
  return Object.values(value).some(hasTextDeep);
}

// Map OCLC FRBR key into the frabl contract node when present.
function buildFrabl(title = {}) {
  const frabl = text(title.frbrkey || title.frbrKey);
  return {
    _attributes: {
      translation: "FRBR Nummer (FRABL)",
      "search-method": frabl ? "frabl" : "",
      "search-term": frabl,
      "search-type": frabl ? "searcher" : "",
    },
    _text: frabl,
  };
}

// Build main and secondary author nodes from OCLC author/collaborator fields.
function buildAuthors(author = {}, authorName = {}, collaborators = []) {
  const result = {
    "main-author": {
      _attributes: {
        "search-method": "author",
        "search-term": text(author.description),
        "search-type": "searcher",
        translation: "Auteur (hoofd)",
        firstname: authorName.firstName,
        lastname: authorName.lastName,
        preposition: authorName.preposition,
        type: text(author.addition),
        "localized-type": "",
        creatortype: text(author.type),
        main: "true",
      },
      _text: text(author.description),
    },
  };

  const secondary = collaborators.map((collaborator) => ({
    _attributes: {
      "search-method": "author",
      "search-term": text(collaborator.description),
      "search-type": "searcher",
      translation: "Auteur",
      type: text(collaborator.addition),
      "localized-type": "",
      creatortype: text(collaborator.type),
    },
    _text: text(collaborator.description),
  })).filter((item) => item._text);

  if (secondary.length) result.author = repeatable(secondary);

  return result;
}

// Build ISBN/PPN identifier nodes from OCLC title/titleInfo fields.
function buildIdentifiers(isbn = [], ppn = [], titleRecord = {}) {
  const result = {};

  const isbnNodes = isbn.map((value) => ({
    _attributes: {
      "search-method": "isbn",
      "search-term": value,
      "search-type": "searcher",
      translation: "ISBN",
    },
    _text: value,
  }));

  if (isbnNodes.length) {
    result["isbn-id"] = repeatable(isbnNodes);
    result["normalized-isbn-id"] = repeatable(isbn.map((value) => ({
      _attributes: { translation: "ISBN (genormaliseerd)" },
      _text: value.replace(/^=/, ""),
    })));
  }

  const ppnValue = text(ppn[0] || titleRecord.ppn);
  if (ppnValue) {
    result["ppn-id"] = {
      _attributes: {
        "search-method": "ppn",
        "search-term": ppnValue,
        "search-type": "precise",
        translation: "PICA productienummer",
      },
      _text: ppnValue,
    };
  }

  return result;
}

// Build publication contract nodes from direct year and parsed imprint values.
function buildPublication(title = {}, titleRecord = {}, imprint = {}) {
  const year = text(title.publicationYear || titleRecord.publicationYear || imprint.year);
  const result = {
    year: {
      _attributes: {
        translation: "Publicatiejaar",
        "search-method": "year",
        "search-term": year,
        "search-type": "searcher",
      },
      _text: year,
    },
    publishers: {
      publisher: {
        _attributes: {
          translation: "Uitgever",
          "search-method": "publisher",
          "search-term": imprint.publisher,
          "search-type": "searcher",
          year,
          place: imprint.place,
        },
        _text: imprint.publisher,
      },
    },
  };

  const edition = text(title.annotationEdition);
  if (edition) {
    result.editions = {
      edition: {
        _attributes: { translation: "Editie" },
        _text: edition,
      },
    };
  }

  return result;
}

// Build genre contract nodes from OCLC genre descriptions.
function buildGenres(genres = []) {
  const nodes = genres.map((genre) => ({
    _attributes: {
      translation: "Genre",
      "search-method": "genre",
      "search-term": text(genre.description),
      "search-type": "searcher",
    },
    _text: text(genre.description),
  })).filter((item) => item._text);

  return { genre: repeatable(nodes) };
}

// Build target-audience node if OCLC audience data is available.
function buildTargetAudiences(title = {}) {
  const description = text(title.audience?.description);
  const code = text(title.audience?.code);

  return {
    "target-audience": {
      _attributes: {
        translation: "Doelgroep",
        "search-method": "targetaudience",
        "search-term": code,
        "search-type": "searcher",
        raw: code,
      },
      _text: description,
    },
  };
}

// Check whether the OCLC titleSeries object contains displayable data.
function hasSeries(series = {}) {
  return Boolean(text(series.description || series.addition || series.number));
}

// Build series contract node from OCLC titleSeries.
function buildSeries(series = {}) {
  return {
    "series-title": {
      _attributes: {
        translation: "In de reeks",
        "search-method": "series",
        "search-term": text(series.description),
        "search-type": "searcher",
        volume: text(series.addition || series.number),
      },
      _text: text(series.description),
    },
  };
}

// Build undup-info from available OCLC grouping fields.
function buildUndupInfo(title = {}, author = {}) {
  const frbr = text(title.frbrkey || title.frbrKey);
  const children = asArray(title.childTitleList);
  const count = children.length ? String(children.length) : "";

  return {
    _attributes: {
      key: frbr,
      cnt: count,
      sort: "",
      frabl: frbr,
      "frabl-global-count": count,
      "frabl-key1": text(title.title || title.mainTitle),
      "frabl-key2": text(author.description),
      translation: "Informatie over dubbele items",
      "undup-all-search": "",
    },
  };
}

// Build the df/MARC block in the current OBA detail contract.
// Values are direct OCLC values where possible; parsed/split values must be documented in the mapping CSV.
function buildMarc({
  title,
  titleRecord,
  author,
  authorName,
  collaborators,
  subjects,
  genres,
  language,
  series,
  isbn,
  ppn,
  imprint,
  collation,
  nbd,
  bookCode,
}) {
  const marc = { _attributes: { src: "v" } };

  const df010 = isbn.map((value) => ({ df010: marcNode("a", value) }));
  if (df010.length) marc.df010 = repeatable(df010);

  const ppnValue = text(ppn[0] || titleRecord.ppn);
  if (ppnValue) marc.df020 = { df020: marcNode("b", ppnValue) };
  if (bookCode) marc.df059 = { df059: marcNode("j", bookCode) };

  const languagePublication = publicationLanguage(language);
  if (languagePublication) marc.df101 = { df101: marcNode("a", languagePublication) };

  const df200 = [
    marcNode("a", text(title.mainTitle || title.title)),
    marcNode("b", text(title.media?.description)),
    marcNode("f", text(author.description)),
    marcNode("g", collaborators.map((item) => text(item.description)).filter(Boolean).join(", ")),
  ].filter((node) => node._text);
  if (df200.length) marc.df200 = { df200 };

  const df210 = [
    marcNode("a", imprint.place),
    marcNode("c", imprint.publisher),
    marcNode("d", text(title.publicationYear || titleRecord.publicationYear || imprint.year)),
  ].filter((node) => node._text);
  if (df210.length) marc.df210 = { df210 };

  const df215 = [
    marcNode("a", collation.pages),
    marcNode("c", collation.illustrations),
    marcNode("d", collation.size),
    marcNode("e", collation.attachment),
  ].filter((node) => node._text);
  if (df215.length) marc.df215 = { df215 };

  if (hasSeries(series)) {
    marc.df520 = {
      df520: [
        marcNode("a", text(series.description)),
        marcNode("v", text(series.addition || series.number)),
      ].filter((node) => node._text),
    };
  }

  const df700 = [
    marcNode("4", text(author.addition)),
    marcNode("a", authorName.lastName),
    marcNode("b", authorName.firstNameWithPreposition),
    marcNode("z", ""),
    marcNode("ab", text(author.description)),
    marcNode("ap", ""),
  ].filter((node) => node._text);
  if (df700.length) marc.df700 = { df700 };

  const df630 = subjects.map((subject) => ({ df630: marcNode("a", text(subject.description)) }));
  if (df630.length) marc.df630 = repeatable(df630);

  const df691 = genres.map((genre) => ({ df691: marcNode("a", text(genre.description)) }));
  if (df691.length) marc.df691 = repeatable(df691);

  const df702 = collaborators.map((collaborator) => {
    const name = parseName(collaborator.description);
    const nodes = [
      marcNode("4", text(collaborator.addition)),
      marcNode("a", name.lastName),
      marcNode("b", name.firstNameWithPreposition),
      marcNode("z", ""),
      marcNode("ab", text(collaborator.description)),
      marcNode("ap", ""),
    ].filter((node) => node._text);

    return nodes.length ? { df702: nodes } : null;
  }).filter(Boolean);
  if (df702.length) marc.df702 = repeatable(df702);

  if (nbd) marc.df014 = { df014: marcNode("a", nbd) };

  const summary = text(title.contents || titleRecord.description);
  if (summary) marc.df320 = { df320: marcNode("a", summary) };

  const edition = text(title.annotationEdition);
  if (edition) marc.df205 = { df205: marcNode("a", edition) };

  // df044 bestaat in het GB-contract, maar er is geen direct OCLC-veld voor productieland.
  marc.df044 = { df044: marcNode("a", "") };

  return marc;
}

// Create one keyed df subfield node.
function marcNode(key, value) {
  return {
    _attributes: { key },
    _text: text(value),
  };
}

// Split an OCLC display name into the name parts expected by the current contract.
function parseName(description = "") {
  const source = text(description);
  if (!source) {
    return { lastName: "", firstName: "", preposition: "", firstNameWithPreposition: "" };
  }

  if (!source.includes(",")) {
    const parts = source.split(/\s+/).filter(Boolean);
    const lastName = parts.pop() || "";
    const firstNameWithPreposition = parts.join(" ");
    const { firstName, preposition } = splitFirstNamePreposition(firstNameWithPreposition);
    return { lastName, firstName, preposition, firstNameWithPreposition };
  }

  const [lastName = "", ...firstParts] = source.split(",");
  const firstNameWithPreposition = text(firstParts.join(","));
  const { firstName, preposition } = splitFirstNamePreposition(firstNameWithPreposition);
  return {
    lastName: text(lastName),
    firstName,
    preposition,
    firstNameWithPreposition,
  };
}

// Separate simple Dutch name prepositions for the contract attributes.
function splitFirstNamePreposition(value = "") {
  const source = text(value);
  const match = source.match(/^(.+?)\s+(van|de|den|der|van de|van der|van den)$/i);
  if (!match) return { firstName: source, preposition: "" };
  return { firstName: text(match[1]), preposition: text(match[2]) };
}

// Parse OCLC imprint text into place/publisher/year for contract fields that require separate values.
function parseImprint(imprint = "") {
  const source = text(imprint);
  const [place = "", rest = ""] = source.split(":");
  const yearMatch = rest.match(/[©\[\(]?(\d{4})[\]\)]?/);
  return {
    place: text(place),
    publisher: text(rest.replace(/,?\s*[©\[\(]?\d{4}[\]\)]?.*$/, "")),
    year: text(yearMatch?.[1]),
  };
}

// Parse OCLC annotationCollation into pages, illustrations, size and attachment.
function parseCollation(value = "") {
  const full = normalizeCollation(value);
  const [pagesPart = "", rest = ""] = full.split(":");
  const [illustrationsPart = "", sizeAttachmentPart = ""] = rest.split(";");
  const [sizePart = "", attachmentPart = ""] = sizeAttachmentPart.split("+");

  return {
    full,
    pages: text(pagesPart),
    illustrations: text(illustrationsPart),
    size: text(sizePart),
    attachment: text(attachmentPart),
  };
}

// Normalize spacing in the collation text before splitting it.
function normalizeCollation(value = "") {
  return text(value).replace(/\s+:\s+/g, ": ").replace(/\s+;\s+/g, " ; ").replace(/\s+\+\s+/g, " + ");
}

// Compose language code and description for the df101 contract field.
function publicationLanguage(language = {}) {
  const code = text(language.code);
  const description = text(language.description);
  if (code && description) return `${code} [${description}]`;
  return description || code;
}

// Extract lid/order number from OCLC momkeys or image URL when available.
function extractLid(value = "") {
  return text(value).match(/(?:^|[;?&])lid=([^;&]+)/)?.[1] || "";
}

// Fallback for book code when itemInformation has no callNumber/headWord.
function firstLocalCallNumber(title = {}) {
  const value = asArray(title.localCallNumbers)[0];
  if (!value) return "";
  return text(value.description || value.callNumber || value);
}

// Read the first non-empty value for a field from OCLC itemInformation.
function firstItemValue(items = [], field) {
  return text(asArray(items).find((item) => text(item?.[field]))?.[field]);
}

// Build the keyed branch/exemplar nodes required by librarian-info.record.meta.branches.
function buildBranches(items = []) {
  return asArray(items)
    .map((item) => {
      const branchArea = text(item.branchId);
      const shelfCode = text(item.shelfCode || item.location);
      const callNumber = text(item.callNumber || item.headWord);
      const location = text(item.subLocation || item.shelfDescription || item.location);
      const p = [
        text(item.barcode || item.id),
        text(item.branchId),
        text(item.branchName),
        shelfCode,
        callNumber,
        location,
        text(item.returnDate),
        text(item.effectiveStatus),
        text(item.effectiveStatusCode),
        text(item.material),
        text(item.location),
        text(item.itemCreationDate),
      ].join("^");

      return {
        branches: [
          branchNode("p", p),
          branchNode("b", text(item.barcode || item.id)),
          branchNode("s", shelfCode),
          branchNode("m", callNumber),
          branchNode("k", location),
          branchNode("a", branchArea),
          branchNode("rss", text(item.itemCreationDate)),
        ],
      };
    });
}

// Create one keyed branch subfield node.
function branchNode(key, value) {
  return {
    _attributes: { key },
    _text: text(value),
  };
}

// Build the top-level branches summary from OCLC itemInformation branch ids/names.
function buildTopBranches(items = []) {
  const branchNames = new Map();
  asArray(items)
    .forEach((item) => {
      const id = text(item.branchId);
      const name = text(item.branchName || item.branchId);
      if (id || name) branchNames.set(id || name, name || id);
    });

  return [
    {
      branch: Array.from(branchNames.entries()).map(([id, name]) => ({
        _attributes: {
          id,
          translation: name,
        },
      })),
    },
    { branch: [] },
  ];
}
