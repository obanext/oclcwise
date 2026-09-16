import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  buildOclcNbcPlusAllRows,
  buildOclcNbcPlusUsedRows,
  buildOclcNbcPlusViewModel,
  toOclcNbcPlusAllCsv,
  toOclcNbcPlusUsedCsv,
} from "../utils/oclcNbcPlusDetailRows.js";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const hasValue = (value) => value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
const rawText = (value) => typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
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

function DisplayValue({ value, href = "", hrefs = [] }) {
  if (Array.isArray(value)) {
    return (
      <ul className="raw-value-list">
        {value.map((entry, index) => (
          <li key={`${rawText(entry)}-${index}`}>
            {hrefs[index] ? (
              <Link href={hrefs[index]} style={{ color: "inherit", textDecoration: "underline" }}>{rawText(entry)}</Link>
            ) : rawText(entry)}
          </li>
        ))}
      </ul>
    );
  }
  const content = <span className="raw-value">{hasValue(value) ? rawText(value) : "—"}</span>;
  return href ? <Link href={href} style={{ color: "inherit", textDecoration: "underline" }}>{content}</Link> : content;
}

function SpecificationRows({ rows }) {
  return (
    <section className="specs-list">
      {rows.map((row) => (
        <div className="spec-row" key={`${row.label}-${row.field}`}>
          <div className="spec-label">{row.label}</div>
          <div className="spec-value"><DisplayValue value={row.value} href={row.href} hrefs={row.hrefs} /></div>
        </div>
      ))}
    </section>
  );
}

export function OclcNbcPlusDetailPage({
  detailType = "luisterboek",
  apiRoute = "/api/oclc-luisterboek-detail",
}) {
  const router = useRouter();
  const { ppn } = router.query;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("specs");

  useEffect(() => {
    if (!router.isReady || !ppn) return undefined;

    let cancelled = false;
    setData(null);
    setError("");

    fetch(`${apiRoute}?ppn=${encodeURIComponent(ppn)}`)
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
  }, [apiRoute, router.isReady, ppn]);

  const record = data?.title || {};
  const view = useMemo(() => buildOclcNbcPlusViewModel(record), [record]);
  const usedRows = useMemo(() => buildOclcNbcPlusUsedRows(record, { detailType }), [detailType, record]);
  const allRows = useMemo(() => buildOclcNbcPlusAllRows(record), [record]);
  const calls = asArray(data?.debug?.calls);
  const topRows = usedRows.filter((row) => row.section === "Specificaties");
  const practicalRows = usedRows.filter((row) => row.section === "Praktische informatie");
  const authorRow = usedRows.find((row) => row.label === "Eerste verantwoordelijke");
  const subjectRow = usedRows.find((row) => row.section === "Onderwerpen" && row.label === "Onderwerpen");
  const detailLabel = detailType === "ebook" ? "e-book" : detailType === "landelijk" ? "landelijk" : "luisterboek";
  const filePrefix = detailType === "ebook" ? "oclc-ebook" : detailType === "landelijk" ? "oclc-landelijk" : "oclc-luisterboek";
  const availabilityLabel = detailType === "landelijk" && view.available === true ? "Beschikbaar" : view.availabilityLabel;
  const actionLabel = detailType === "landelijk" ? (view.loanName || "Bekijk bron") : "Digitaal te lenen";

  if (error) return <div className="container">Fout: {error}</div>;
  if (!data) return <div className="container">Loading...</div>;

  return (
    <div className="page">
      <div className="header-image"><img src="/header.JPG" alt="OBA" /></div>

      <div className="container detail-page oclc-all-detail-page">
        <nav className="oba-breadcrumbs" aria-label="Broodkruimelpad">
          <button type="button" className="oba-chip" onClick={() => router.back()}>← Terug</button>
          <span className="oba-chip oba-chip-dark">⌂</span>
          <span className="oba-chip">OCLC {detailLabel}</span>
        </nav>

        <section className="hero">
          <div className="hero-left">
            <h1 className="title">{view.title || "Onbekende titel"}</h1>
            {view.authors.length ? (
              <div className="author-line">
                <DisplayValue value={view.authors.join(", ")} href={authorRow?.href} />
              </div>
            ) : null}
            {view.summary ? <div className="summary-text">{view.summary}</div> : null}

            {availabilityLabel ? (
              <div style={{ alignItems: "center", display: "flex", gap: "8px", margin: "22px 0" }}>
                <span
                  aria-hidden="true"
                  style={{
                    background: view.available === true ? "#69ad79" : "#c44",
                    borderRadius: "50%",
                    display: "inline-block",
                    flex: "0 0 13px",
                    height: "13px",
                    width: "13px",
                  }}
                />
                <span>{availabilityLabel}</span>
              </div>
            ) : null}

            {view.loanUrl ? (
              <p>
                <a className="tab-button active" href={view.loanUrl} target="_blank" rel="noreferrer">
                  {actionLabel}
                </a>
              </p>
            ) : null}

            <div className="card-grid top-cards">
              <section className="info-card">
                <h2>Specificaties</h2>
                <ul className="raw-specification-values">
                  {topRows.map((row) => (
                    <li key={`${row.label}-${row.field}`}><DisplayValue value={row.value} href={row.href} hrefs={row.hrefs} /></li>
                  ))}
                </ul>
              </section>

              <section className="info-card">
                <h2>Onderwerpen</h2>
                {view.subjects.length ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {view.subjects.map((subject, index) => (
                      <li key={`${subject}-${index}`} style={{ marginBottom: "10px" }}>
                        <DisplayValue value={subject} href={subjectRow?.hrefs?.[index]} />
                      </li>
                    ))}
                  </ul>
                ) : <span>Geen onderwerpen beschikbaar</span>}
              </section>
            </div>
          </div>

          <div className="hero-right">
            {view.cover ? (
              <img src={view.cover} className="cover-large" alt={view.title || "Cover"} />
            ) : <div className="cover-placeholder">Geen cover</div>}
          </div>
        </section>

        <div className="section-header">
          <h2>Praktische informatie</h2>
          <div className="tab-buttons">
            <button type="button" className={tab === "specs" ? "tab-button active" : "tab-button"} onClick={() => setTab("specs")}>specificaties</button>
            <button type="button" className={tab === "displayed-fields" ? "tab-button active" : "tab-button"} onClick={() => setTab("displayed-fields")}>velden detailpagina</button>
            <button type="button" className={tab === "oclc" ? "tab-button active" : "tab-button"} onClick={() => setTab("oclc")}>alles oclc</button>
          </div>
        </div>

        {tab === "specs" ? <SpecificationRows rows={practicalRows} /> : null}

        {tab === "displayed-fields" ? (
          <section className="table-card displayed-fields-table-card">
            <div className="all-oclc-summary">
              <strong>{usedRows.length} getoonde velden</strong>
              <span>In dezelfde conceptuele volgorde als op deze {detailLabel}detailpagina.</span>
            </div>
            <button
              type="button"
              className="tab-button"
              onClick={() => downloadFile(
                `${filePrefix}-${ppn}-gebruikte-velden.csv`,
                toOclcNbcPlusUsedCsv(usedRows),
                "text/csv;charset=utf-8;"
              )}
            >
              Download gebruikte velden CSV
            </button>
            <div className="table-wrap">
              <table className="detail-table displayed-fields-table">
                <thead><tr><th>Volgorde</th><th>Onderdeel</th><th>Getoonde veldnaam</th><th>OCLC-veldnaam</th><th>Waarde</th><th>Endpoint path</th><th>Zoeklink</th><th>Opmerking</th></tr></thead>
                <tbody>
                  {usedRows.map((row) => (
                    <tr key={`${row.order}-${row.label}`}>
                      <td>{row.order}</td><td>{row.section}</td><td>{row.label}</td>
                      <td><code>{row.field}</code></td>
                      <td><span className="raw-table-value">{Array.isArray(row.value) ? row.value.join(" | ") : rawText(row.value)}</span></td>
                      <td><code>{row.endpoint}</code></td><td><code>{row.searchLink}</code></td><td>{row.note}</td>
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
              <strong>{allRows.length} ruwe velden</strong>
              <span>Alle velden uit de NBC+-detailresponse, inclusief lege en technische waarden.</span>
            </div>
            <button
              type="button"
              className="tab-button"
              onClick={() => downloadFile(
                `${filePrefix}-${ppn}-alle-velden-oclc.csv`,
                toOclcNbcPlusAllCsv(allRows),
                "text/csv;charset=utf-8;"
              )}
            >
              Download Alles OCLC CSV
            </button>
            <div className="table-wrap">
              <table className="detail-table all-oclc-table">
                <thead><tr><th>Veldnaam OCLC</th><th>Veldnaam site</th><th>OBA.nl IST</th><th>Endpoint path</th><th>Waarde</th><th>Opmerkingen</th></tr></thead>
                <tbody>
                  {allRows.map((row, index) => (
                    <tr key={`${row.veldnaamOclc}-${index}`}>
                      <td><code>{row.veldnaamOclc}</code></td><td>{row.veldnaamSite}</td><td>{row.obaIst}</td>
                      <td><code>{row.endpoint}</code></td><td><span className="raw-table-value">{row.waarde}</span></td><td>{row.opmerkingen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="debug-section">
          <div className="download-buttons-row">
            <button type="button" className="tab-button" onClick={() => downloadFile(`${filePrefix}-${ppn}.json`, pretty(record), "application/json;charset=utf-8;")}>Download OCLC JSON</button>
            <button type="button" className="tab-button" onClick={() => downloadFile(`${filePrefix}-${ppn}-gebruikte-velden.csv`, toOclcNbcPlusUsedCsv(usedRows), "text/csv;charset=utf-8;")}>Gebruikte velden OCLC CSV</button>
            <button type="button" className="tab-button" onClick={() => downloadFile(`${filePrefix}-${ppn}-alle-velden-oclc.csv`, toOclcNbcPlusAllCsv(allRows), "text/csv;charset=utf-8;")}>Alle velden OCLC CSV</button>
          </div>

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

export default OclcNbcPlusDetailPage;
