import { useEffect } from "react";


function formatKind(kind) {
  return kind
    .split(".")
    .map((segment) =>
      segment
        .split("_")
        .map(
          (word) =>
            word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(" ")
    )
    .join(" → ");
}


export default function ChangeHistoryModal({
  history,
  onClose,
}) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () =>
      window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);


  return (
    <div
      className="history-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="history-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Unified change history"
      >
        <div className="section-header">
          <div>
            <h2>Unified Change History</h2>

            <p className="muted">
              Cleaning operations and column renames.
            </p>
          </div>

          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {!history || history.operations.length === 0 ? (
          <p>No changes have been committed.</p>
        ) : (
          <>
            <p className="muted">
              Committed operations:{" "}
              {history.history_count}
            </p>

            <ol className="cleaning-history">
              {history.operations.map((record) => (
                <li key={record.id}>
                  <strong>{formatKind(record.kind)}</strong>

                  <span className="muted">
                    {new Date(
                      record.created_at
                    ).toLocaleString()}
                  </span>

                  <details>
                    <summary>Operation details</summary>

                    <pre className="cleaning-json">
                      {JSON.stringify(
                        record.details,
                        null,
                        2
                      )}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
