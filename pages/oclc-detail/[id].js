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
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    if (!router.isReady || !id) return;

    let cancelled = false;
    setData(null);
    setError("");
    setCoverFailed(false);

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

  const volumeTitle = [titleData?.volume, titleData?.volumeTitle].filter(hasValue).join(", ");
  const titleParts = [
    titleData?.mainTitle || titleData?.title || titleRecord?.title,
    titleData?.subtitle,
    volumeTitle,
  ].filter(hasValue);
  const combinedTitle = titleParts.join(" / ");

  const authorValues = [
    titleData?.author?.description,
    ...asArray(titleData?.collaborators).map((entry) => entry?.description),
  ].filter(hasValue);

  const cover = titleData?.imageUrls?.large
    || titleData?.imageUrls?.medium
    || titleData?.imageUrls?.small
    || "";

  const headlineRows = useMemo(() => [
    { label: "Beschikbaar", value: titleData?.available },
    { label: "Reserveren toegestaan", value: titleAvailability[0]?.holdAllowed },
  ], [titleData, titleAvailability]);

  const topSpecificationRows = useMemo(() => [
    { label: "Algemene materiaalaanduiding", value: titleData?.media?.description },
    { label: "Taal publicatie", value: titleData?.language },
    { label: "Uitgave", value: titleData?.imprint },
    { label: "Collatie", value: titleData?.annotationCollation },
    { label: "Doelgroep", value: titleData?.audience?.description },
  ].filter((row) => hasValue(row.value)), [titleData]);

  const practicalRows = useMemo(() => [
    { label: "ISBN Nummer", value: titleData?.isbn },
    { label: "PPN Nummer", value: titleData?.ppn },
    { label: "Boekcode / plaatsingscode", value: itemInformation.map((item) => item?.callNumber).filter(hasValue) },
    { label: "Taal publicatie", value: titleData?.language },
    { label: "Hoofdtitel", value: titleData?.mainTitle },
    { label: "Algemene materiaalaanduiding", value: titleData?.media?.description },
    { label: "Eerste verantwoordelijke", value: titleData?.author?.description },
    { label: "Titel - deeltitel", value: [titleData?.subtitle, titleData?.volume, titleData?.volumeTitle].filter(hasValue) },
    { label: "Impressum", value: titleData?.imprint },
    { label: "Jaar van uitgave", value: titleData?.publicationYear },
    { label: "Collatie", value: titleData?.annotationCollation },
    { label: "Annotatie", value: titleData?.annotationNoMarc },
    { label: "Editie", value: titleData?.annotationEdition },
    { label: "Auteur Functie", value: titleData?.author?.addition },
    {
      label: "Auteur - secundaire - Functie",
      value: asArray(titleData?.collaborators).map((entry) => entry?.addition).filter(hasValue),
    },
    {
      label: "Auteur - secundaire",
      value: asArray(titleData?.collaborators).map((entry) => entry?.description).filter(hasValue),
    },
    { label: "Doelgroep", value: titleData?.audience?.description },
    { label: "Reeks", value: titleData?.titleSeries },
    { label: "Genre", value: titleData?.genre },
    { label: "Trefwoord - hoofdgeleding", value: titleData?.subjects },
    { label: "Samenvatting - Tekst", value: titleData?.contents },
  ].filter((row) => hasValue(row.value)), [itemInformation, titleData]);

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

  const allOclc = useMemo(() => ({
    discoveryTitleResponse: data?.title ?? null,
    titleResponse: data?.titleInfo ?? null,
    titleAvailabilityResponse: data?.availability ?? null,
    itemInformationResponse: data?.itemInformation ?? null,
  }), [data]);

  const detailRows = useMemo(() => buildOclcDetailRows(data), [data]);

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
            {authorValues.length ? <div className="author-line">{authorValues.join(" · ")}</div> : null}
            {hasValue(titleData?.contents) ? <div className="summary-text"><RawValue value={titleData.contents} /></div> : null}

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
            {cover && !coverFailed ? (
              <img
                src={cover}
                className="cover-large"
                alt={combinedTitle || "Cover"}
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <div className="cover-placeholder">Geen cover</div>
            )}
          </div>
        </section>

        <div className="section-header">
          <h2>Praktische informatie</h2>
          <div className="tab-buttons">
            <button type="button" className={tab === "specs" ? "tab-button active" : "tab-button"} onClick={() => setTab("specs")}>specificaties</button>
            <button type="button" className={tab === "availability" ? "tab-button active" : "tab-button"} onClick={() => setTab("availability")}>beschikbaarheid</button>
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

        {tab === "oclc" ? (
          <section className="table-card all-oclc-table-card">
            <div className="all-oclc-summary">
              <strong>{detailRows.length} ruwe velden</strong>
              <span>Alle velden uit de vier OCLC-responses, inclusief lege en technische waarden.</span>
            </div>
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
          <button type="button" className="tab-button" onClick={() => downloadFile(`oclc-detail-${id}.csv`, toOclcDetailCsv(detailRows), "text/csv;charset=utf-8;")}>Download OCLC CSV</button>

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
