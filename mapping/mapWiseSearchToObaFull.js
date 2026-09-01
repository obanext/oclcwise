// Normalize values that may be returned as a singleton or an array.
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

// Convert optional OCLC values to safe contract text.
const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

// Return the first non-empty value from possible source fields.
const first = (...values) => values.find((value) => text(value)) || "";

// Validate detail ids before they are emitted into the mapped search result.
function isNumericId(value) {
  return /^\d+$/.test(text(value));
}

// Preserve the current XML-to-JSON contract shape: one node as object, multiple as array.
function repeatable(items) {
  const values = asArray(items).filter(hasTextDeep);
  if (values.length === 1) return values[0];
  return values;
}

// Check whether a contract node contains a visible value.
function hasTextDeep(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return Boolean(text(value));
  if (Array.isArray(value)) return value.some(hasTextDeep);
  return Object.values(value).some(hasTextDeep);
}

// Split an OCLC display name into contract attributes.
function splitName(value = "") {
  const source = text(value);

  if (!source) return { first: "", last: "" };

  if (source.includes(",")) {
    const [last = "", ...rest] = source.split(",");
    return { first: text(rest.join(", ")), last: text(last) };
  }

  const parts = source.split(/\s+/).filter(Boolean);
  return {
    first: text(parts.slice(0, -1).join(" ")),
    last: text(parts.slice(-1).join(" ")),
  };
}

// Split OCLC imprint text into place, publisher and year contract values.
function parseImprint(value = "") {
  const source = text(value);
  if (!source) return { place: "", publisher: "", year: "" };

  const [placePart = "", ...restParts] = source.split(":");
  const remainder = text(restParts.join(":"));
  const year = remainder.match(/[©\[\(]?(\d{4})[\]\)]?/)?.[1] || "";
  const publisher = text(remainder.replace(/,?\s*[©\[\(]?\d{4}[\]\)]?.*$/, ""));

  return {
    place: text(placePart),
    publisher,
    year,
  };
}

// Resolve the numeric detail id selected by the API from titlesummary data.
function getDetailId(entry = {}) {
  const id = first(entry.resolvedDetailId, entry.id, entry.title?.id);
  return isNumericId(id) ? text(id) : "";
}

// Select the best available cover URL.
function coverImage(title = {}) {
  return first(title.imageUrls?.small, title.imageUrls?.medium, title.imageUrls?.large);
}

// Map OCLC media to the formats.format contract node.
function normalizeFormat(title = {}) {
  const description = text(title.media?.description);
  const code = text(title.media?.code);

  if (!description && !code) return {};

  return {
    _attributes: {
      translation: "Formaat",
      "search-method": "format",
      "search-term": code,
      "search-type": "searcher",
      raw: code,
    },
    _text: description,
  };
}

// Map secondary OCLC contributors to authors.author contract nodes.
function normalizeContributors(title = {}) {
  const nodes = asArray(title.collaborators)
    .map((collaborator) => {
      const name = text(collaborator?.description);
      if (!name) return null;

      return {
        _attributes: {
          "search-method": "author",
          "search-term": name,
          "search-type": "searcher",
          translation: "Auteur",
          type: text(collaborator?.addition),
          "localized-type": "",
          creatortype: text(collaborator?.type),
        },
        _text: name,
      };
    })
    .filter(Boolean);

  return repeatable(nodes);
}

// Map OCLC subject fields to topical-subject contract nodes.
function normalizeSubjects(title = {}) {
  const nodes = [
    ...asArray(title.subjects),
    ...asArray(title.subjectSchoolWise),
    ...asArray(title.subjectPim),
  ]
    .map((subject) => text(subject?.description || subject?._text || subject?.label || subject))
    .filter(Boolean)
    .map((value) => ({
      _attributes: {
        translation: "Onderwerp",
        "search-method": "subject",
        "search-term": value,
        "search-type": "fuzzy,precise",
      },
      _text: value,
    }));

  return repeatable(nodes);
}

// Map OCLC genre descriptions to genres.genre contract nodes.
function normalizeGenres(title = {}) {
  const nodes = asArray(title.genre)
    .map((genre) => text(genre?.description || genre))
    .filter(Boolean)
    .map((value) => ({
      _attributes: {
        translation: "Genre",
        "search-method": "genre",
        "search-term": value,
        "search-type": "searcher",
      },
      _text: value,
    }));

  return repeatable(nodes);
}

// Map title variants and original titles when the discovery response supplies them.
function normalizeAdditionalTitles(title = {}) {
  const result = {};
  const variants = asArray(title.titleVariant)
    .map((item) => text(item?.description || item?.title || item))
    .filter(Boolean)
    .map((value) => ({
      _attributes: { translation: "Andere titel" },
      _text: value,
    }));
  const originals = asArray(title.titleOriginalTitle)
    .map((item) => text(item?.description || item?.title || item))
    .filter(Boolean)
    .map((value) => ({
      _attributes: { translation: "Oorspr. titel" },
      _text: value,
    }));

  if (variants.length) result["other-title"] = repeatable(variants);
  if (originals.length) result["origin-title"] = repeatable(originals);

  return result;
}

// Map OCLC series data to the series contract node.
function normalizeSeries(title = {}) {
  const source = asArray(title.titleSeries)[0] || {};
  const description = text(source.description);

  if (!description) return null;

  return {
    "series-title": {
      _attributes: {
        translation: "In de reeks",
        "search-method": "series",
        "search-term": description,
        "search-type": "searcher",
        volume: text(source.addition || source.number),
      },
      _text: description,
    },
  };
}

// Map direct audience data, or derive an audience from OCLC youth/adult flags.
function normalizeAudience(title = {}) {
  const source = title.audience || title.targetGroup || {};
  const directDescription = text(source?.description || (typeof source === "string" ? source : ""));
  const directCode = text(source?.code);

  if (directDescription || directCode) {
    return {
      "target-audience": {
        _attributes: {
          translation: "Doelgroep",
          "search-method": "targetaudience",
          "search-term": directCode,
          "search-type": "searcher",
          raw: directCode,
        },
        _text: directDescription,
      },
    };
  }

  let description = "";
  let code = "";

  if (title.youth === true && title.adult === true) {
    description = "Jeugd en volwassenen";
    code = "youth,adult";
  } else if (title.youth === true) {
    description = "Jeugd";
    code = "youth";
  } else if (title.adult === true) {
    description = "Volwassenen";
    code = "adult";
  }

  return {
    "target-audience": {
      _attributes: {
        translation: "Doelgroep",
        "search-method": "targetaudience",
        "search-term": code,
        "search-type": code ? "searcher" : "",
        raw: code,
      },
      _text: description,
    },
  };
}

// Build undup-info from OCLC grouping fields available in the search/detail responses.
function normalizeUndupInfo(title = {}, sourceId = "", detailId = "", authorName = "") {
  const children = asArray(title.childTitleList);
  const count = children.length ? String(children.length) : "";
  const key = text(sourceId || detailId);

  return {
    _attributes: {
      key,
      cnt: count,
      sort: "",
      frabl: text(sourceId),
      "frabl-global-count": count,
      "frabl-key1": text(title.title || title.mainTitle),
      "frabl-key2": authorName,
      translation: "Informatie over dubbele items",
      "undup-all-search": "",
    },
  };
}

// Map one enriched OCLC search result to the current OBA search JSON contract.
function normalizeResult(entry = {}) {
  const detailId = getDetailId(entry);
  if (!detailId) return null;

  const title = entry.title || {};
  const sourceId = text(entry.sourceId || title.frbrkey || title.frbrKey);
  const authorName = text(title.author?.description || title.author);
  const authorParts = splitName(authorName);
  const contributors = normalizeContributors(title);
  const isbn = text(asArray(title.isbn)[0]);
  const ppn = text(asArray(title.ppn)[0]);
  const language = asArray(title.language)[0] || {};
  const imprint = parseImprint(title.imprint);
  const publicationDetailsPublisher =
    typeof title.publicationDetails === "object"
      ? first(title.publicationDetails?.publisher, title.publicationDetails?.description)
      : title.publicationDetails;
  const publisher = text(first(title.publisher, publicationDetailsPublisher, imprint.publisher));
  const publicationPlace = text(first(title.publicationPlace, imprint.place));
  const publicationYear = text(first(title.publicationYear, imprint.year));
  const edition = first(title.annotationEdition, title.edition);
  const series = normalizeSeries(title);

  const result = {
    id: {
      _attributes: {
        nativeid: detailId,
        sourceid: sourceId,
        ds: "",
        translation: "ID",
        "search-method": "id",
        "search-term": detailId,
        "search-type": "precise",
      },
      _text: detailId,
    },

    "detail-page": {
      _text: `/oba-detail/${encodeURIComponent(detailId)}`,
    },

    coverimages: {
      coverimage: {
        _attributes: { translation: "Cover" },
        _text: coverImage(title),
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
        _text: first(title.mainTitle, title.title),
      },
      ...normalizeAdditionalTitles(title),
    },

    authors: {
      "main-author": {
        _attributes: {
          "search-method": "author",
          "search-term": authorName,
          "search-type": "searcher",
          translation: "Auteur (hoofd)",
          firstname: authorParts.first,
          lastname: authorParts.last,
          type: text(title.author?.addition),
          "localized-type": "",
          creatortype: text(title.author?.type || (authorName ? "person" : "")),
          main: "true",
        },
        _text: authorName,
      },
    },

    formats: { format: normalizeFormat(title) },

    publication: {
      year: {
        _attributes: {
          translation: "Publicatiejaar",
          "search-method": "year",
          "search-term": publicationYear,
          "search-type": "searcher",
        },
        _text: publicationYear,
      },
      publishers: {
        publisher: {
          _attributes: {
            translation: "Uitgever",
            "search-method": "publisher",
            "search-term": publisher,
            "search-type": "searcher",
            year: publicationYear,
            place: publicationPlace,
          },
          _text: publisher,
        },
      },
    },

    languages: {
      language: {
        _attributes: {
          translation: "Taal",
          "search-method": "language",
          "search-term": text(language.code),
          "search-type": "searcher",
          raw: text(language.code),
        },
        _text: text(language.description || language),
      },
    },

    description: {
      pages: {
        _attributes: { translation: "Pagina's" },
        _text: text(title.annotationCollation).split(":")[0]?.trim() || "",
      },
      "physical-description": {
        _attributes: { translation: "Kenmerken" },
        _text: text(title.annotationCollation),
      },
    },

    summaries: {
      summary: {
        _attributes: { translation: "Samenvatting" },
        _text: first(title.contents, title.contentsSchoolWise, title.summary),
      },
    },

    genres: { genre: normalizeGenres(title) },
    subjects: { "topical-subject": normalizeSubjects(title) },
    "target-audiences": normalizeAudience(title),

    frabl: {
      _attributes: {
        translation: "FRBR Nummer (FRABL)",
        "search-method": sourceId ? "frabl" : "",
        "search-term": sourceId,
        "search-type": sourceId ? "searcher" : "",
      },
      _text: sourceId,
    },

    identifiers: {
      "isbn-id": {
        _attributes: {
          "search-method": "isbn",
          "search-term": isbn,
          "search-type": "searcher",
          translation: "ISBN",
        },
        _text: isbn,
      },
      "normalized-isbn-id": {
        _attributes: { translation: "ISBN (genormaliseerd)" },
        _text: isbn,
      },
      "ppn-id": {
        _attributes: {
          "search-method": "ppn",
          "search-term": ppn,
          "search-type": "precise",
          translation: "PICA productienummer",
        },
        _text: ppn,
      },
    },

    "undup-info": normalizeUndupInfo(title, sourceId, detailId, authorName),
    custom: {},
  };

  if (hasTextDeep(contributors)) result.authors.author = contributors;

  if (edition) {
    result.publication.editions = {
      edition: {
        _attributes: { translation: "Editie" },
        _text: edition,
      },
    };
  }

  if (series) result.series = series;

  return result;
}

// Public mapper for IST search.
// Input: titlesummary results enriched with discovery-title responses.
// Output: mapped JSON in the current OBA/GB search contract shape.
export function mapWiseSearchToObaFull(raw = {}) {
  const titles = asArray(raw.titles).filter(
    (entry) => entry?.title && typeof entry.title === "object" && isNumericId(getDetailId(entry))
  );

  const results = titles.map(normalizeResult).filter(Boolean);

  return {
    _attributes: {
      version: "1",
      "detail-level": "Default",
      source: "oclc-wise",
    },
    meta: {
      count: { _text: String(raw.total || results.length || 0) },
      page: { _text: String(raw.page || 1) },
      query: { _text: text(raw.query) },
    },
    feedbacks: {},
    results: { result: results },
    suggestions: {
      suggestion: asArray(raw.suggestions)
        .map((item) => ({
          _text:
            typeof item === "string"
              ? item
              : text(item?.text || item?.value || item?.suggestion || item?.term),
        }))
        .filter((item) => item._text),
    },
  };
}
