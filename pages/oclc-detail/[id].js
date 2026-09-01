import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { buildOclcDetailRows, toOclcDetailCsv } from "../../utils/oclcDetailRows";

const pretty = (value) => JSON.stringify(value, null, 2);
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

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

function availabilityStatus(item = {}) {
  const status = text(item?.effectiveStatus || item?.status);
  const labels = {
    AVAILABLE: "Aanwezig",
    ON_LOAN: "Uitgeleend",
    MISSING: "Niet beschikbaar",
    IN_TRANSIT: "Onderweg",
  };

  return labels[status] || status;
}

/**
 * ALL detail page.
 * Presents OCLC source data directly as a visual detail page, JSON evidence, API calls and downloads.
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
  const titleInfo = data?.titleInfo || {};
  const calls = asArray(data?.debug?.calls);
  const warnings = asArray(data?.warnings);

  const title = firstText(titleData?.mainTitle, titleData?.title, titleInfo?.mainTitle, titleInfo?.title);
  const subtitle = firstText(titleData?.subtitle, titleInfo?.subtitle);
  const author = firstText(titleData?.author?.description, titleInfo?.author?.description);
  const summary = firstText(titleData?.contents, titleData?.contentsSchoolWise, titleInfo?.contents);
  const cover = firstText(
    titleData?.imageUrls?.large,
    titleData?.imageUrls?.medium,
    titleData?.imageUrls?.small,
    titleInfo?.imageUrls?.large,
    titleInfo?.imageUrls?.medium,
    titleInfo?.imageUrls?.small
  );

  const subjects = useMemo(() => {
    const values = [
      ...asArray(titleData?.subjects),
      ...asArray(titleData?.subject),
      ...asArray(titleData?.subjectPim),
      ...asArray(titleData?.subjectSchoolWise),
    ];

    return values
      .map((entry) => text(entry?.description || entry?.label || entry))
      .filter(Boolean);
  }, [titleData]);

  const genres = useMemo(
    () => asArray(titleData?.genre).map((entry) => text(entry?.description || entry)).filter(Boolean),
    [titleData]
  );

  const language = asArray(titleData?.language)
    .map((entry) => text(entry?.description || entry?.code || entry))
    .filter(Boolean)
    .join(", ");

  const series = asArray(titleData?.titleSeries)
    .map((entry) => text(entry?.description || entry?.title || entry))
    .filter(Boolean)
    .join(", ");

  const specRows = useMemo(() => {
    const rows = [
      ["OCLC/Wise detail-id", text(id)],
      ["Materiaal", firstText(titleData?.media?.description, titleData?.mediumGroup?.description)],
      ["Materiaalcode", text(titleData?.media?.code)],
      ["Publicatiejaar", text(titleData?.publicationYear)],
      ["Editie", firstText(titleData?.annotationEdition, titleData?.edition)],
      ["Imprint", text(titleData?.imprint)],
      ["Collatie", text(titleData?.annotationCollation)],
      ["Taal", language],
      ["ISBN", asArray(titleData?.isbn).map(text).filter(Boolean).join(", ")],
      ["PPN", firstText(titleData?.ppn, titleInfo?.ppn)],
      ["Reeks", series],
      ["Genre", genres.join(", ")],
    ];

    return rows.filter(([, value]) => value);
  }, [genres, id, language, series, titleData, titleInfo]);

  const recommendationItems = useMemo(
    () => asArray(data?.recommendations?.items).slice(0, 5),
    [data]
  );

  const availabilityRows = useMemo(
    () =>
      asArray(data?.itemInformation).map((item, index) => ({
        key: `${text(item?.barcode || item?.id) || "item"}-${index}`,
        location: firstText(item?.branchName, item?.branchId),
        place: firstText(item?.subLocation, item?.shelfDescription, item?.location),
        shelf: firstText(item?.callNumber, item?.headWord, item?.shelfCode),
        status: availabilityStatus(item),
      })),
    [data]
  );

  const allOclc = useMemo(
    () => ({
      discoveryTitleResponse: data?.title || null,
      titleResponse: data?.titleInfo || null,
      titleAvailabilityResponse: data?.availability || null,
      itemInformationResponse: data?.itemInformation || null,
      recommendedTitlesResponse: data?.recommendations || null,
    }),
    [data]
  );

  const detailRows = useMemo(() => buildOclcDetailRows(data), [data]);

  if (error) return <div className="container">Fout: {error}</div>;
  if (!data) return <div className="container">Loading...</div>;

  return (
    <div className="page">
      <div className="header-image">
        <img src="/header.JPG" alt="OBA" />
      </div>

      <div className="container detail-page">
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
            <h1 className="title">{title || "Onbekende titel"}</h1>
            {subtitle ? <div className="subtitle">{subtitle}</div> : null}
            {author ? <div className="author-line">{author}</div> : null}
            {summary ? <div className="summary-text">{summary}</div> : null}

            <div className="card-grid top-cards">
              <section className="info-card">
                <h2>Specificaties</h2>
                <ul className="plain-list">
                  {[firstText(titleData?.media?.description, titleData?.mediumGroup?.description), language, titleData?.imprint, titleData?.annotationCollation, series]
                    .filter(Boolean)
                    .map((value, index) => (
                      <li key={`${value}-${index}`}>{value}</li>
                    ))}
                </ul>
              </section>

              <section className="info-card">
                <h2>Onderwerpen</h2>
                <ul className="plain-list">
                  {[...subjects, ...genres].length ? (
                    [...subjects, ...genres].map((value, index) => <li key={`${value}-${index}`}>{value}</li>)
                  ) : (
                    <li>Geen onderwerpen beschikbaar</li>
                  )}
                </ul>
              </section>
            </div>
          </div>

          <div className="hero-right">
            {cover ? <img src={cover} className="cover-large" alt={title || "Cover"} /> : <div className="cover-placeholder">Geen cover</div>}
          </div>
        </section>

        <section className="recommendations-section">
          <div className="section-header">
            <h2>Aanbevolen titels</h2>
          </div>

          {recommendationItems.length ? (
            <div className="recommendation-grid">
              {recommendationItems.map((item, index) => {
                const recommendationId = text(item?.id);
                const recommendationTitle = firstText(item?.title, `Aanbevolen titel ${index + 1}`);
                const recommendationMeta = [
                  text(item?.author),
                  text(item?.publicationYear),
                  text(item?.medium?.code),
                ].filter(Boolean);

                const content = (
                  <>
                    <h3>{recommendationTitle}</h3>
                    {recommendationMeta.length ? (
                      <p>{recommendationMeta.join(" · ")}</p>
                    ) : null}
                  </>
                );

                return recommendationId ? (
                  <a
                    className="recommendation-card"
                    href={`/oclc-detail/${encodeURIComponent(recommendationId)}`}
                    key={`${recommendationId}-${index}`}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="recommendation-card" key={`recommendation-${index}`}>
                    {content}
                  </div>
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
            <button type="button" className={tab === "oclc" ? "tab-button active" : "tab-button"} onClick={() => setTab("oclc")}>alles oclc</button>
          </div>
        </div>

        {tab === "availability" ? (
          <section className="table-card">
            <div className="table-wrap">
              <table className="detail-table">
                <thead><tr><th>Locatie</th><th>Plaats</th><th>Signatuur</th><th>Status</th></tr></thead>
                <tbody>
                  {availabilityRows.length ? availabilityRows.map((row) => (
                    <tr key={row.key}><td>{row.location || "—"}</td><td>{row.place || "—"}</td><td>{row.shelf || "—"}</td><td>{row.status || "—"}</td></tr>
                  )) : <tr><td>—</td><td>—</td><td>—</td><td>Geen exemplaren beschikbaar</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "specs" ? (
          <section className="specs-list">
            {specRows.map(([label, value]) => <div className="spec-row" key={label}><div className="spec-label">{label}</div><div className="spec-value">{value}</div></div>)}
          </section>
        ) : (
          <section className="debug-block">
            <div className="debug-content"><pre>{pretty(allOclc)}</pre></div>
          </section>
        )}

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
