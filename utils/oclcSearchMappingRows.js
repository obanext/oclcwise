const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

function escapeCsv(value) {
  const stringValue = text(value);

  if (/[",\n\r;]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function toCsv(rows = [], headers = []) {
  return [
    headers.join(";"),
    ...asArray(rows).map((row) => headers.map((header) => escapeCsv(row?.[header])).join(";")),
  ].join("\n");
}

export function buildOclcResultRows(data = {}) {
  return asArray(data?.items).map((item, index) => ({
    index: item.index || index + 1,
    query: text(data?.query),
    perspectiveId: text(data?.selectedPerspectiveId),
    searchScope: text(data?.selectedSearchScope),
    detailId: text(item?.detailId),
    sourceId: text(item?.sourceId),
    frbrId: text(item?.frbrId),
    detailHref: text(item?.detailHref),
    title: text(item?.title),
    mainTitle: text(item?.mainTitle),
    subtitle: text(item?.subtitle),
    author: text(item?.author?.description),
    mediaCode: text(item?.media?.code),
    media: text(item?.media?.description),
    mediumGroup: text(item?.mediumGroup?.description),
    publicationYear: text(item?.publicationYear),
    language: asArray(item?.language).map((entry) => text(entry?.description || entry?.code)).filter(Boolean).join(", "),
    genre: asArray(item?.genre).map((entry) => text(entry?.description)).filter(Boolean).join(", "),
    subject: text(item?.subjectPim?.description),
    isbn: asArray(item?.isbn).map(text).filter(Boolean).join(", "),
    summary: text(item?.contents),
    cover: text(item?.imageUrls?.medium || item?.imageUrls?.small || item?.imageUrls?.large),
  }));
}

export function buildOclcFacetRows(data = {}) {
  const rows = [];

  asArray(data?.facets).forEach((facet) => {
    asArray(facet?.values).forEach((value) => {
      rows.push({
        query: text(data?.query),
        perspectiveId: text(data?.selectedPerspectiveId),
        searchScope: text(data?.selectedSearchScope),
        facetName: text(facet?.name),
        facetLabelKey: text(facet?.labelKey),
        facetLabel: text(facet?.label),
        valueKey: text(value?.key),
        valueTerm: text(value?.term),
        valueLabel: text(value?.label),
        count: text(value?.count),
        facetFilter: text(value?.facetFilter),
      });
    });
  });

  return rows;
}

export function toOclcResultCsv(rows = []) {
  return toCsv(rows, [
    "index",
    "query",
    "perspectiveId",
    "searchScope",
    "detailId",
    "sourceId",
    "frbrId",
    "detailHref",
    "title",
    "mainTitle",
    "subtitle",
    "author",
    "mediaCode",
    "media",
    "mediumGroup",
    "publicationYear",
    "language",
    "genre",
    "subject",
    "isbn",
    "summary",
    "cover",
  ]);
}

export function toOclcFacetCsv(rows = []) {
  return toCsv(rows, [
    "query",
    "perspectiveId",
    "searchScope",
    "facetName",
    "facetLabelKey",
    "facetLabel",
    "valueKey",
    "valueTerm",
    "valueLabel",
    "count",
    "facetFilter",
  ]);
}
