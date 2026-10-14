export const STEPS = [
  { id: 1, label: "01", title: "Ingest", description: "Source CSV & session connection" },
  { id: 2, label: "02", title: "Profile", description: "Schema inspection & anomaly screening" },
  { id: 3, label: "03", title: "Transform", description: "Data cleaning & type normalization" },
  { id: 4, label: "04", title: "Planner", description: "Hypothesis resolution & engine execution" },
  { id: 5, label: "05", title: "Synthesis", description: "Telemetry visualization & neural brief" },
];

export function StepperNav({
  currentStep,
  onSelectStep,
  dataset,
  execution,
}) {
  function isStepUnlocked(stepId) {
    if (stepId === 1) return true;
    if (stepId <= 4) return Boolean(dataset);
    if (stepId === 5) return Boolean(dataset && execution);
    return false;
  }

  return (
    <nav className="stepper-rail" aria-label="Workbench Stages">
      <div className="stepper-track">
        {STEPS.map((step) => {
          const isCurrent = currentStep === step.id;
          const isUnlocked = isStepUnlocked(step.id);
          const isCompleted =
            (step.id === 1 && Boolean(dataset)) ||
            (step.id === 2 && Boolean(dataset)) ||
            (step.id === 3 && Boolean(dataset)) ||
            (step.id === 4 && Boolean(execution)) ||
            (step.id === 5 && Boolean(execution));

          return (
            <button
              key={step.id}
              type="button"
              className={`stage-step-card ${isCurrent ? "current" : ""} ${
                isUnlocked ? "unlocked" : "locked"
              } ${isCompleted ? "completed" : ""}`}
              onClick={() => {
                if (isUnlocked) {
                  onSelectStep(step.id);
                }
              }}
              disabled={!isUnlocked}
              title={
                !isUnlocked
                  ? step.id === 5
                    ? "Locked: Execute an analysis in Step 04 first"
                    : "Locked: Ingest a dataset in Step 01 first"
                  : step.description
              }
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="stage-step-top">
                <span className="stage-index">{step.label}</span>
                {isUnlocked ? (
                  isCompleted && !isCurrent ? (
                    <span className="stage-status-check">✓</span>
                  ) : isCurrent ? (
                    <span className="stage-active-pulse" />
                  ) : null
                ) : (
                  <span className="stage-lock-icon">🔒</span>
                )}
              </div>

              <div className="stage-meta">
                <span className="stage-title">{step.title}</span>
                <span className="stage-desc">{step.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function StepFooter({
  currentStep,
  onPrevious,
  onNext,
  dataset,
  execution,
}) {
  const prevStep = STEPS.find((s) => s.id === currentStep - 1);
  const nextStep = STEPS.find((s) => s.id === currentStep + 1);

  const canProceed =
    (currentStep === 1 && Boolean(dataset)) ||
    (currentStep === 2 && Boolean(dataset)) ||
    (currentStep === 3 && Boolean(dataset)) ||
    (currentStep === 4 && Boolean(execution)) ||
    (currentStep === 5);

  let lockReason = "";
  if (!canProceed) {
    if (currentStep === 1) lockReason = "Ingest a CSV dataset to advance.";
    else if (currentStep === 4)
      lockReason = "Execute an analysis in the planner to unlock visualization telemetry.";
  }

  return (
    <footer className="stage-footer-bar">
      <div className="footer-left">
        {prevStep && (
          <button
            type="button"
            className="outline-button"
            onClick={onPrevious}
          >
            ← STAGE {prevStep.label}: {prevStep.title.toUpperCase()}
          </button>
        )}
      </div>

      <div className="footer-right">
        {lockReason && <span className="warning-text">⚠️ {lockReason}</span>}

        {nextStep && (
          <button
            type="button"
            className="execute-button"
            onClick={onNext}
            disabled={!canProceed}
            title={lockReason || `Proceed to Stage ${nextStep.label}: ${nextStep.title}`}
          >
            STAGE {nextStep.label}: {nextStep.title.toUpperCase()} →
          </button>
        )}
      </div>
    </footer>
  );
}
