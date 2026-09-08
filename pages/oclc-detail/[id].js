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
  ];

  return [
    columns.map(([, label]) => escapeCsvCell(label)).join(";"),
    ...rows.map((row) => columns.map(([key]) => escapeCsvCell(row?.[key])).join(";")),
  ].join("\n");
}

function firstSource(candidates) {
  return candidates.find((candidate) => hasValue(candidate.value)) || candidates[0];
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
  const titleAvailability = asArray(data?.availability);
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
  const summary = summarySource.value;
  const cover = coverSource.value;

  const headlineRows = useMemo(() => [
    { label: "Beschikbaar", value: titleData?.available, field: "available", endpoint: ENDPOINTS.discovery },
    { label: "Reserveren toegestaan", value: titleAvailability[0]?.holdAllowed, field: "[0].holdAllowed", endpoint: ENDPOINTS.availability },
  ], [titleData, titleAvailability]);

  const topSpecificationRows = useMemo(() => [
    { label: "Algemene materiaalaanduiding", value: titleData?.media?.description, field: "media.description", endpoint: ENDPOINTS.discovery },
    { label: "Taal publicatie", value: titleData?.language, field: "language", endpoint: ENDPOINTS.discovery },
    { label: "Uitgave", value: titleData?.imprint, field: "imprint", endpoint: ENDPOINTS.discovery },
    { label: "Collatie", value: titleData?.annotationCollation, field: "annotationCollation", endpoint: ENDPOINTS.discovery },
    { label: "Doelgroep", value: titleData?.audience?.description, field: "audience.description", endpoint: ENDPOINTS.discovery },
  ].filter((row) => hasValue(row.value)), [titleData]);

  const practicalRows = useMemo(() => [
    { label: "ISBN Nummer", value: isbnSource.value, field: isbnSource.field, endpoint: isbnSource.endpoint },
    { label: "PPN Nummer", value: ppnSource.value, field: ppnSource.field, endpoint: ppnSource.endpoint },
    { label: "Boekcode / plaatsingscode", value: itemInformation.map((item) => item?.callNumber).filter(hasValue), field: "[].callNumber", endpoint: ENDPOINTS.items },
    { label: "Taal publicatie", value: titleData?.language, field: "language", endpoint: ENDPOINTS.discovery },
    { label: "Hoofdtitel", value: titleSource.value, field: titleSource.field, endpoint: titleSource.endpoint },
    { label: "Algemene materiaalaanduiding", value: titleData?.media?.description, field: "media.description", endpoint: ENDPOINTS.discovery },
    { label: "Eerste verantwoordelijke", value: authorSource.value, field: authorSource.field, endpoint: authorSource.endpoint },
    { label: "Titel - deeltitel", value: [subtitleSource.value, volumeSource.value, volumeNameSource.value].filter(hasValue), field: "subtitle | volume | volumeTitle", endpoint: ENDPOINTS.discovery },
    { label: "Impressum", value: titleData?.imprint, field: "imprint", endpoint: ENDPOINTS.discovery },
    { label: "Jaar van uitgave", value: publicationYearSource.value, field: publicationYearSource.field, endpoint: publicationYearSource.endpoint },
    { label: "Collatie", value: titleData?.annotationCollation, field: "annotationCollation", endpoint: ENDPOINTS.discovery },
    { label: "Annotatie", value: titleData?.annotationNoMarc, field: "annotationNoMarc", endpoint: ENDPOINTS.discovery },
    { label: "Editie", value: titleData?.annotationEdition ?? titleData?.edition, field: hasValue(titleData?.annotationEdition) ? "annotationEdition" : "edition", endpoint: ENDPOINTS.discovery },
    { label: "Auteur Functie", value: titleData?.author?.addition, field: "author.addition", endpoint: ENDPOINTS.discovery },
    {
      label: "Auteur - secundaire - Functie",
      value: asArray(titleData?.collaborators).map((entry) => entry?.addition).filter(hasValue),
      field: "collaborators[].addition",
      endpoint: ENDPOINTS.discovery,
    },
    {
      label: "Auteur - secundaire",
      value: asArray(titleData?.collaborators).map((entry) => entry?.description).filter(hasValue),
      field: "collaborators[].description",
      endpoint: ENDPOINTS.discovery,
    },
    { label: "Doelgroep", value: titleData?.audience?.description, field: "audience.description", endpoint: ENDPOINTS.discovery },
    { label: "Reeks", value: titleData?.titleSeries, field: "titleSeries", endpoint: ENDPOINTS.discovery },
    { label: "Genre", value: titleData?.genre, field: "genre", endpoint: ENDPOINTS.discovery },
    { label: "Trefwoord - hoofdgeleding", value: titleData?.subjects, field: "subjects", endpoint: ENDPOINTS.discovery },
    { label: "Samenvatting - Tekst", value: summarySource.value, field: summarySource.field, endpoint: summarySource.endpoint },
  ].filter((row) => hasValue(row.value)), [itemInformation, summarySource, titleData, titleSource, authorSource, subtitleSource, volumeSource, volumeNameSource, isbnSource, ppnSource, publicationYearSource]);

  const titleAvailabilityRows = useMemo(() => titleAvailability.flatMap((record, recordIndex) => {
    const statuses = asArray(record?.availability);
    const statusRows = statuses.length ? statuses : [{}];

    return statusRows.map((status, statusIndex) => ({
      key: `title-availability-${recordIndex}-${statusIndex}`,
      bibliographicRecordId: record?.bibliographicRecordId,
      ppn: record?.ppn,
      catGroup: status?.catGroup,
      status: status?.status,
      statusCode: status?.statusCode,
      holdAllowed: record?.holdAllowed,
      holdQueuePosition: record?.holdQueuePosition,
      numberOfItems: record?.numberOfItems,
      material: record?.material,
    }));
  }), [titleAvailability]);

  const itemRows = useMemo(() => itemInformation.map((item, index) => ({
    key: `${item?.id ?? item?.barcode ?? "item"}-${index}`,
    branchName: item?.branchName,
    branchId: item?.branchId,
    location: item?.location,
    subLocation: item?.subLocation,
    shelfDescription: item?.shelfDescription,
    callNumber: item?.callNumber,
    effectiveStatus: item?.effectiveStatus,
    effectiveStatusCode: item?.effectiveStatusCode,
    returnDate: item?.returnDate,
    barcode: item?.barcode,
  })), [itemInformation]);

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
      },
      { section: "Auteur", label: "Eerste verantwoordelijke", field: authorSource.field, value: author, endpoint: authorSource.endpoint },
      { section: "Samenvatting", label: "Samenvatting", field: summarySource.field, value: summary, endpoint: summarySource.endpoint },
      { section: "Cover", label: "Cover", field: coverSource.field, value: cover, endpoint: coverSource.endpoint },
      ...headlineRows.map((row) => ({ section: "Beschikbaarheid", ...row })),
      ...topSpecificationRows.map((row) => ({ section: "Specificaties", ...row })),
      ...recommendationFieldRows,
      ...practicalRows.map((row) => ({ section: "Tab Praktische Informatie Specificatie", ...row })),
    ];

    titleAvailabilityRows.forEach((row, index) => {
      const prefix = `[${index}]`;
      [
        ["Bibliografisch record-ID", "bibliographicRecordId", row.bibliographicRecordId],
        ["PPN", "ppn", row.ppn],
        ["Catalogusgroep", "availability[].catGroup", row.catGroup],
        ["Status", "availability[].status", row.status],
        ["Statuscode", "availability[].statusCode", row.statusCode],
        ["Reserveren toegestaan", "holdAllowed", row.holdAllowed],
        ["Wachtrijpositie", "holdQueuePosition", row.holdQueuePosition],
        ["Aantal exemplaren", "numberOfItems", row.numberOfItems],
        ["Materiaal", "material", row.material],
      ].forEach(([label, field, value]) => rows.push({
        section: "Tab Praktische Informatie Beschikbaarheid Titelniveau",
        label,
        field: `${prefix}.${field}`,
        value,
        endpoint: ENDPOINTS.availability,
      }));
    });

    itemRows.forEach((row, index) => {
      [
        ["Vestiging", "branchName", row.branchName],
        ["Vestigings-ID", "branchId", row.branchId],
        ["Locatie", "location", row.location],
        ["Deellocatie", "subLocation", row.subLocation],
        ["Vindplaats", "shelfDescription", row.shelfDescription],
        ["Boekcode / plaatsingscode", "callNumber", row.callNumber],
        ["Status", "effectiveStatus", row.effectiveStatus],
        ["Statuscode", "effectiveStatusCode", row.effectiveStatusCode],
        ["Inleverdatum", "returnDate", row.returnDate],
        ["Barcode", "barcode", row.barcode],
      ].forEach(([label, field, value]) => rows.push({
        section: "Tab Praktische Informatie Beschikbaarheid Exemplarenniveau",
        label,
        field: `[${index}].${field}`,
        value,
        endpoint: ENDPOINTS.items,
      }));
    });

    return rows
      .filter((row) => hasValue(row.value))
      .map((row, index) => ({ ...row, order: index + 1 }));
  }, [author, authorSource, combinedTitle, cover, coverSource, headlineRows, itemRows, practicalRows, recommendationItems, subtitleSource, summary, summarySource, titleAvailabilityRows, titleSource, topSpecificationRows, volumeNameSource, volumeSource]);

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

            <div className="raw-headline-grid">
              {headlineRows.map((row) => (
                <div className="raw-headline-item" key={row.label}>
                  <strong>{row.label}</strong>
                  <RawValue value={row.value} />
                </div>
              ))}
            </div>

            <div className="card-grid top-cards top-cards-single">
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
              <h3>Beschikbaarheid op titelniveau</h3>
              <div className="table-wrap">
                <table className="detail-table raw-data-table">
                  <thead>
                    <tr>
                      <th>Bibliografisch record-ID</th><th>PPN</th><th>Catalogusgroep</th><th>Status</th>
                      <th>Statuscode</th><th>Reserveren toegestaan</th><th>Wachtrijpositie</th><th>Aantal exemplaren</th><th>Materiaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {titleAvailabilityRows.length ? titleAvailabilityRows.map((row) => (
                      <tr key={row.key}>
                        <td><RawValue value={row.bibliographicRecordId} /></td><td><RawValue value={row.ppn} /></td>
                        <td><RawValue value={row.catGroup} /></td><td><RawValue value={row.status} /></td>
                        <td><RawValue value={row.statusCode} /></td><td><RawValue value={row.holdAllowed} /></td>
                        <td><RawValue value={row.holdQueuePosition} /></td><td><RawValue value={row.numberOfItems} /></td>
                        <td><RawValue value={row.material} /></td>
                      </tr>
                    )) : <tr><td colSpan="9">Geen titleavailability-response beschikbaar</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="table-card">
              <h3>Exemplaren</h3>
              <div className="table-wrap">
                <table className="detail-table raw-data-table">
                  <thead>
                    <tr>
                      <th>Vestiging</th><th>Vestigings-ID</th><th>Locatie</th><th>Deellocatie</th><th>Vindplaats</th>
                      <th>Boekcode / plaatsingscode</th><th>Status</th><th>Statuscode</th><th>Inleverdatum</th><th>Barcode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemRows.length ? itemRows.map((row) => (
                      <tr key={row.key}>
                        <td><RawValue value={row.branchName} /></td><td><RawValue value={row.branchId} /></td>
                        <td><RawValue value={row.location} /></td><td><RawValue value={row.subLocation} /></td>
                        <td><RawValue value={row.shelfDescription} /></td><td><RawValue value={row.callNumber} /></td>
                        <td><RawValue value={row.effectiveStatus} /></td><td><RawValue value={row.effectiveStatusCode} /></td>
                        <td><RawValue value={row.returnDate} /></td><td><RawValue value={row.barcode} /></td>
                      </tr>
                    )) : <tr><td colSpan="10">Geen iteminformation-response beschikbaar</td></tr>}
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
                    <th>OCLC-veldnaam</th><th>Waarde</th><th>Endpoint path</th>
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
