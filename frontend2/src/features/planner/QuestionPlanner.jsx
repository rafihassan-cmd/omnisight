import { useEffect, useRef, useState } from "react";

import {
    getGeneratedQuestions,
    validatePreparedAnalysis,
} from "../../api/planner";

import {
    getCurrentDatasetProfile,
} from "../../api/datasets";

import {
    executeAnalysis,
} from "../../api/analysis";

import AnalysisResults from "../analysis/AnalysisResults";


function formatCategory(value) {
    return value
        .split("_")
        .map(
            (word) =>
                word.charAt(0).toUpperCase() +
                word.slice(1)
        )
        .join(" ");
}


function resolveParameters(question, drafts) {
    const values = {};
    const errors = {};

    const edits = drafts[question.id] || {};

    for (const spec of question.parameter_schema) {
        const raw = Object.prototype.hasOwnProperty.call(
            edits,
            spec.name
        )
            ? edits[spec.name]
            : String(
                question.parameters[spec.name] ??
                spec.default
            );

        if (spec.value_type === "integer") {
            if (!/^-?\d+$/.test(raw)) {
                errors[spec.name] = "Enter a whole number.";
                continue;
            }

            const parsed = Number(raw);

            if (!Number.isSafeInteger(parsed)) {
                errors[spec.name] = "Invalid integer.";
                continue;
            }

            if (
                spec.minimum !== null &&
                parsed < spec.minimum
            ) {
                errors[spec.name] =
                    `Minimum allowed value is ${spec.minimum}.`;
                continue;
            }

            if (
                spec.maximum !== null &&
                parsed > spec.maximum
            ) {
                errors[spec.name] =
                    `Maximum allowed value is ${spec.maximum}.`;
                continue;
            }

            values[spec.name] = parsed;
            continue;
        }

        if (spec.value_type === "select") {
            if (!spec.choices.includes(raw)) {
                errors[spec.name] =
                    "Select a supported option.";
                continue;
            }

            values[spec.name] = raw;
            continue;
        }

        errors[spec.name] =
            "Unsupported parameter type.";
    }

    return { values, errors };
}


function ParameterControls({
    question,
    drafts,
    errors,
    onChange,
    disabled,
}) {
    if (question.parameter_schema.length === 0) {
        return (
            <p className="muted">
                This question requires no additional parameters.
            </p>
        );
    }

    return (
        <div className="planner-parameters">
            {question.parameter_schema.map((spec) => {
                const edits = drafts[question.id] || {};

                const value = Object.prototype.hasOwnProperty.call(
                    edits,
                    spec.name
                )
                    ? edits[spec.name]
                    : String(
                        question.parameters[spec.name] ??
                        spec.default
                    );

                const inputId = `planner-${spec.name}`;
                const errorId = `${inputId}-error`;

                return (
                    <div className="planner-field" key={spec.name}>
                        <label htmlFor={inputId}>
                            {spec.label}
                        </label>

                        {spec.value_type === "select" ? (
                            <select
                                id={inputId}
                                value={value}
                                disabled={disabled}
                                onChange={(event) =>
                                    onChange(
                                        question.id,
                                        spec.name,
                                        event.target.value
                                    )
                                }
                            >
                                {spec.choices.map((option) => (
                                    <option key={option} value={option}>
                                        {formatCategory(option)}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                id={inputId}
                                type="number"
                                step="1"
                                min={spec.minimum ?? undefined}
                                max={spec.maximum ?? undefined}
                                value={value}
                                disabled={disabled}
                                aria-invalid={Boolean(
                                    errors[spec.name]
                                )}
                                aria-describedby={
                                    errors[spec.name] ? errorId : undefined
                                }
                                onChange={(event) =>
                                    onChange(
                                        question.id,
                                        spec.name,
                                        event.target.value
                                    )
                                }
                            />
                        )}

                        {spec.value_type === "integer" && (
                            <p className="muted">
                                Range: {spec.minimum ?? "any"} to{" "}
                                {spec.maximum ?? "any"}
                            </p>
                        )}

                        {errors[spec.name] && (
                            <p
                                id={errorId}
                                className="planner-field-error"
                                role="alert"
                            >
                                {errors[spec.name]}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}


function ColumnBindings({ question, profile }) {
    const columns = new Map(
        profile.columns.map((column) => [
            column.id,
            column,
        ])
    );

    const bindings = Object.entries(question.bindings);

    if (bindings.length === 0) {
        return (
            <p className="muted">
                This question analyzes the dataset as a whole.
            </p>
        );
    }

    return (
        <dl className="planner-binding-list">
            {bindings.map(([role, columnId]) => {
                const column = columns.get(columnId);

                return (
                    <div key={role}>
                        <dt>{formatCategory(role)}</dt>
                        <dd>
                            {column
                                ? `${column.name} (${column.semantic_type})`
                                : "Unknown column"}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}


export default function QuestionPlanner({
    dataset,
    onRefreshDataset,
    disabled = false,
}) {
    const [catalog, setCatalog] = useState(null);
    const [profile, setProfile] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [refreshCount, setRefreshCount] = useState(0);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");

    const [selectedQuestionId, setSelectedQuestionId] =
        useState(null);

    // Parameter drafts are scoped to individual question IDs.
    const [drafts, setDrafts] = useState({});

    const [copyStatus, setCopyStatus] = useState("");
    const [validating, setValidating] = useState(false);

    const [validation, setValidation] = useState(null);

    const [validationError, setValidationError] =
        useState("");
    const datasetId = dataset.dataset_id;
    const datasetVersion = dataset.version;

    const [executing, setExecuting] = useState(false);

    const [execution, setExecution] = useState(null);

    const [executionError, setExecutionError] = useState("");

    const executionAbortRef = useRef(null);


    useEffect(() => {
        const controller = new AbortController();

        executionAbortRef.current?.abort();
        executionAbortRef.current = null;

        setExecuting(false);
        setExecution(null);
        setExecutionError("");
        setLoading(true);
        setError("");
        setCatalog(null);
        setProfile(null);
        setSelectedQuestionId(null);
        setDrafts({});
        setCopyStatus("");
        setValidation(null);
        setValidationError("");

        async function loadPlanner() {
            try {
                const [questions, datasetProfile] =
                    await Promise.all([
                        getGeneratedQuestions({
                            signal: controller.signal,
                        }),
                        getCurrentDatasetProfile({
                            signal: controller.signal,
                        }),
                    ]);

                if (controller.signal.aborted) return;

                const matchesDataset =
                    questions.dataset_id === datasetId &&
                    questions.dataset_version === datasetVersion &&
                    datasetProfile.dataset_id === datasetId &&
                    datasetProfile.dataset_version === datasetVersion;

                if (!matchesDataset) {
                    throw new Error(
                        "The dataset changed while loading questions. " +
                        "Refresh the dataset and try again."
                    );
                }

                if (!Array.isArray(questions.questions)) {
                    throw new Error(
                        "Invalid question catalog returned by the server."
                    );
                }

                setCatalog(questions);
                setProfile(datasetProfile);
            } catch (err) {
                if (!controller.signal.aborted) {
                    setError(err.message);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        loadPlanner();

        return () => {
            controller.abort();

            executionAbortRef.current?.abort();
            executionAbortRef.current = null;
        };
    }, [datasetId, datasetVersion, refreshCount]);


    // Prevent a previous dataset revision's catalog from
    // being displayed during asynchronous refresh.
    const activeCatalog =
        catalog?.dataset_id === datasetId &&
            catalog?.dataset_version === datasetVersion &&
            profile?.dataset_id === datasetId &&
            profile?.dataset_version === datasetVersion
            ? catalog
            : null;

    const allQuestions = activeCatalog?.questions || [];

    const categories = [
        ...new Set(
            allQuestions.map((question) => question.category)
        ),
    ].sort();

    const searchText = search.trim().toLowerCase();

    const visibleQuestions = allQuestions.filter(
        (question) => {
            const matchesCategory =
                category === "all" ||
                question.category === category;

            const matchesSearch =
                !searchText ||
                [
                    question.title,
                    question.description,
                    question.template_id,
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(searchText);

            return matchesCategory && matchesSearch;
        }
    );

    const selectedQuestion =
        visibleQuestions.find(
            (question) => question.id === selectedQuestionId
        ) ||
        visibleQuestions[0] ||
        null;

    const parameterResult = selectedQuestion
        ? resolveParameters(selectedQuestion, drafts)
        : { values: {}, errors: {} };

    const parametersValid =
        Object.keys(parameterResult.errors).length === 0;

    // The payload for the future analysis executor.
    // No executable algorithm or column binding is trusted
    // from the frontend.
    const preparedRequest =
        selectedQuestion && parametersValid
            ? {
                question_id: selectedQuestion.id,
                expected_version: datasetVersion,
                parameters: parameterResult.values,
            }
            : null;

    // Validation results belong to one exact
    // question/version/parameter combination.
    const preparedRequestKey = preparedRequest
        ? JSON.stringify(preparedRequest)
        : null;

    const activeValidation =
        preparedRequestKey &&
            validation?.requestKey === preparedRequestKey
            ? validation.response
            : null;

    const activeExecution =
        preparedRequestKey &&
            execution?.requestKey === preparedRequestKey &&
            execution.response?.plan?.dataset_id === datasetId &&
            execution.response?.plan?.dataset_version === datasetVersion &&
            execution.response?.plan?.question_id === selectedQuestion?.id
            ? execution.response
            : null;

    const controlsDisabled =
        disabled || loading || validating || executing;

    function clearAnalysisExecution() {
        executionAbortRef.current?.abort();
        executionAbortRef.current = null;

        setExecuting(false);
        setExecution(null);
        setExecutionError("");
    }

    function updateParameter(questionId, name, value) {
        setDrafts((previous) => ({
            ...previous,
            [questionId]: {
                ...(previous[questionId] || {}),
                [name]: value,
            },
        }));

        setCopyStatus("");

        setValidation(null);
        setValidationError("");

        clearAnalysisExecution();
    }


    function selectQuestion(questionId) {
        setSelectedQuestionId(questionId);

        setCopyStatus("");

        setValidation(null);
        setValidationError("");

        clearAnalysisExecution();
    }


    async function copyPreparedRequest() {
        if (!preparedRequest) return;

        try {
            await navigator.clipboard.writeText(
                JSON.stringify(preparedRequest, null, 2)
            );

            setCopyStatus("Request JSON copied.");
        } catch {
            setCopyStatus(
                "Could not copy automatically. " +
                "You can select the JSON text below."
            );
        }
    }

    async function handleValidateRequest() {
        if (!preparedRequest || controlsDisabled) {
            return;
        }

        const requestKey = JSON.stringify(preparedRequest);

        setValidating(true);
        setValidation(null);
        setValidationError("");

        try {
            const response = await validatePreparedAnalysis(
                preparedRequest
            );

            if (!response.valid || !response.plan) {
                throw new Error(
                    "The backend returned an invalid validation response."
                );
            }

            setValidation({
                requestKey,
                response,
            });

        } catch (err) {
            setValidationError(err.message);

        } finally {
            setValidating(false);
        }
    }

    async function handleExecuteAnalysis() {
        if (!preparedRequest || controlsDisabled) {
            return;
        }

        // Snapshot the exact request being executed.
        const payload = {
            question_id: preparedRequest.question_id,
            expected_version: preparedRequest.expected_version,
            parameters: {
                ...preparedRequest.parameters,
            },
        };

        const requestKey = JSON.stringify(payload);

        const controller = new AbortController();

        executionAbortRef.current = controller;

        setExecuting(true);
        setExecution(null);
        setExecutionError("");

        try {
            const response = await executeAnalysis(
                payload,
                {
                    signal: controller.signal,
                }
            );

            if (controller.signal.aborted) return;

            if (
                !response?.plan ||
                !response?.result ||
                response.plan.question_id !== payload.question_id ||
                response.plan.dataset_version !== payload.expected_version ||
                response.plan.dataset_id !== datasetId
            ) {
                throw new Error(
                    "The server returned an inconsistent analysis result."
                );
            }

            setExecution({
                requestKey,
                response,
            });

        } catch (err) {
            if (!controller.signal.aborted) {
                setExecutionError(
                    err.message || "Analysis execution failed."
                );
            }

        } finally {
            if (executionAbortRef.current === controller) {
                executionAbortRef.current = null;
                setExecuting(false);
            }
        }
    }


    return (
        <section className="panel planner-workspace">
            <div className="section-header">
                <div>
                    <h2>Analytical Question Planner</h2>

                    <p className="muted">
                        Explore questions generated from your
                        current dataset schema.
                    </p>

                    <p className="muted">
                        Dataset revision: {datasetVersion}
                    </p>
                </div>

                <div className="actions">
                    <button
                        type="button"
                        disabled={controlsDisabled}
                        onClick={() =>
                            setRefreshCount((count) => count + 1)
                        }
                    >
                        Refresh Questions
                    </button>

                    <button
                        type="button"
                        disabled={controlsDisabled}
                        onClick={onRefreshDataset}
                    >
                        Sync Dataset
                    </button>
                </div>
            </div>

            {loading && (
                <p role="status">
                    Generating analytical questions...
                </p>
            )}

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {activeCatalog && profile && (
                <>
                    <div className="planner-stats">
                        <div className="metric">
                            <span>Generated questions</span>
                            <strong>
                                {activeCatalog.total_questions}
                            </strong>
                        </div>

                        <div className="metric">
                            <span>Question categories</span>
                            <strong>{categories.length}</strong>
                        </div>

                        <div className="metric">
                            <span>Generator version</span>
                            <strong className="planner-version">
                                {activeCatalog.generator_version}
                            </strong>
                        </div>
                    </div>

                    <div className="planner-grid">
                        <div className="planner-catalog">
                            <h3>Available Questions</h3>

                            <div className="planner-filters">
                                <div className="planner-field">
                                    <label htmlFor="planner-search">
                                        Search questions
                                    </label>

                                    <input
                                        id="planner-search"
                                        type="search"
                                        value={search}
                                        disabled={controlsDisabled}
                                        placeholder="Search..."
                                        onChange={(event) => {
                                            setSearch(event.target.value);
                                            setSelectedQuestionId(null);
                                            setCopyStatus("");
                                            setValidation(null);
                                            setValidationError("");
                                            clearAnalysisExecution();
                                        }}
                                    />
                                </div>

                                <div className="planner-field">
                                    <label htmlFor="planner-category">
                                        Category
                                    </label>

                                    <select
                                        id="planner-category"
                                        value={category}
                                        disabled={controlsDisabled}
                                        onChange={(event) => {
                                            setCategory(event.target.value);
                                            setSelectedQuestionId(null);
                                            setCopyStatus("");
                                            setValidation(null);
                                            setValidationError("");
                                            clearAnalysisExecution();
                                        }}
                                    >
                                        <option value="all">
                                            All categories
                                        </option>

                                        {categories.map((item) => (
                                            <option key={item} value={item}>
                                                {formatCategory(item)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <p className="muted">
                                Showing {visibleQuestions.length} of{" "}
                                {allQuestions.length} questions.
                            </p>

                            {visibleQuestions.length === 0 ? (
                                <p className="muted">
                                    No matching questions. Try changing
                                    the filters or reviewing your dataset types.
                                </p>
                            ) : (
                                <div className="planner-question-list">
                                    {visibleQuestions.map((question) => (
                                        <button
                                            type="button"
                                            key={question.id}
                                            disabled={controlsDisabled}
                                            className={
                                                question.id === selectedQuestion?.id
                                                    ? "planner-question selected"
                                                    : "planner-question"
                                            }
                                            aria-pressed={
                                                question.id === selectedQuestion?.id
                                            }
                                            onClick={() =>
                                                selectQuestion(question.id)
                                            }
                                        >
                                            <span className="planner-question-category">
                                                {formatCategory(question.category)}
                                            </span>

                                            <strong>{question.title}</strong>

                                            <span className="muted">
                                                {question.description}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="planner-details">
                            {selectedQuestion ? (
                                <>
                                    <span className="planner-question-category">
                                        {formatCategory(
                                            selectedQuestion.category
                                        )}
                                    </span>

                                    <h3>{selectedQuestion.title}</h3>

                                    <p className="muted">
                                        {selectedQuestion.description}
                                    </p>

                                    <h4>Column Bindings</h4>

                                    <ColumnBindings
                                        question={selectedQuestion}
                                        profile={profile}
                                    />

                                    <h4>Analysis Information</h4>

                                    <dl className="planner-binding-list">
                                        <div>
                                            <dt>Analysis method</dt>
                                            <dd>
                                                {selectedQuestion.analysis_method}
                                            </dd>
                                        </div>

                                        <div>
                                            <dt>Visualization intent</dt>
                                            <dd>
                                                {selectedQuestion.visualization_intent}
                                            </dd>
                                        </div>

                                        <div>
                                            <dt>Template</dt>
                                            <dd>{selectedQuestion.template_id}</dd>
                                        </div>
                                    </dl>

                                    <h4>Analysis Parameters</h4>

                                    <ParameterControls
                                        question={selectedQuestion}
                                        drafts={drafts}
                                        errors={parameterResult.errors}
                                        onChange={updateParameter}
                                        disabled={controlsDisabled}
                                    />

                                    <hr />

                                    <div className="section-header">
                                        <div>
                                            <h4>Prepared Analysis Request</h4>

                                            <p className="muted">
                                                This is the payload the execution API
                                                will receive in the next phase.
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={
                                                controlsDisabled ||
                                                !preparedRequest
                                            }
                                            onClick={copyPreparedRequest}
                                        >
                                            Copy JSON
                                        </button>
                                    </div>

                                    {copyStatus && (
                                        <p role="status" className="muted">
                                            {copyStatus}
                                        </p>
                                    )}

                                    {preparedRequest ? (
                                        <pre className="planner-json">
                                            {JSON.stringify(
                                                preparedRequest,
                                                null,
                                                2
                                            )}
                                        </pre>
                                    ) : (
                                        <p className="error" role="alert">
                                            Correct the parameter errors to
                                            prepare a valid request.
                                        </p>
                                    )}
                                    <div className="planner-validation">
                                        <h4>Backend Validation</h4>

                                        <p className="muted">
                                            Verify the selected question, dataset version,
                                            column bindings, and analysis parameters.
                                        </p>

                                        <div className="actions">
                                            <button
                                                type="button"
                                                onClick={handleValidateRequest}
                                                disabled={
                                                    controlsDisabled || !preparedRequest
                                                }
                                            >
                                                {validating
                                                    ? "Validating..."
                                                    : "Validate Request"}
                                            </button>
                                        </div>

                                        {validationError && (
                                            <p className="error" role="alert">
                                                {validationError}
                                            </p>
                                        )}

                                        {activeValidation && (
                                            <div className="planner-validation-result">
                                                <p className="cleaning-success" role="status">
                                                    Request validated successfully.
                                                </p>

                                                <p className="muted">
                                                    The backend has independently resolved the
                                                    question and approved its parameters.
                                                </p>

                                                <h4>Validated Analysis Plan</h4>

                                                <pre className="planner-json">
                                                    {JSON.stringify(
                                                        activeValidation.plan,
                                                        null,
                                                        2
                                                    )}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                    <section className="analysis-execution">
                                        <h4>Execute Analysis</h4>

                                        <p className="muted">
                                            Run the selected analytical question against
                                            the current cleaned dataset.
                                        </p>

                                        <div className="actions">
                                            <button
                                                type="button"
                                                onClick={handleExecuteAnalysis}
                                                disabled={
                                                    controlsDisabled || !preparedRequest
                                                }
                                            >
                                                {executing
                                                    ? "Executing Analysis..."
                                                    : "Execute Analysis"}
                                            </button>
                                        </div>

                                        {executionError && (
                                            <p className="error" role="alert">
                                                {executionError}
                                            </p>
                                        )}

                                        {activeExecution && (
                                            <AnalysisResults
                                                key={activeExecution.execution_id}
                                                execution={activeExecution}
                                            />
                                        )}
                                    </section>
                                </>
                            ) : (
                                <p className="muted">
                                    Select a generated question to inspect
                                    its analysis settings.
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}