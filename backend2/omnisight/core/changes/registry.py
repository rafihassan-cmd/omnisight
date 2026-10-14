"""Registry of supported dataset mutations."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ChangeDefinition:
    kind: str
    label: str
    category: str
    requires_preview: bool
    changes_schema: bool


def definition(
    kind: str,
    label: str,
    category: str,
    *,
    requires_preview: bool = True,
    changes_schema: bool = False,
) -> ChangeDefinition:
    return ChangeDefinition(
        kind=kind,
        label=label,
        category=category,
        requires_preview=requires_preview,
        changes_schema=changes_schema,
    )


CHANGE_REGISTRY: dict[str, ChangeDefinition] = {
    "column.rename": definition(
        "column.rename",
        "Rename Column",
        "schema",
        requires_preview=False,
        changes_schema=True,
    ),

    "rows.drop_duplicates": definition(
        "rows.drop_duplicates",
        "Remove Duplicate Rows",
        "rows",
    ),

    "rows.drop_missing": definition(
        "rows.drop_missing",
        "Remove Rows with Missing Values",
        "missing",
    ),

    "missing.fill_mean": definition(
        "missing.fill_mean",
        "Fill Missing Values with Mean",
        "missing",
    ),

    "missing.fill_constant": definition(
        "missing.fill_constant",
        "Fill Missing Values with Constant",
        "missing",
    ),

    "text.trim": definition(
        "text.trim",
        "Trim Whitespace",
        "text",
    ),

    "text.strip_affixes": definition(
        "text.strip_affixes",
        "Remove Prefix or Suffix",
        "text",
    ),

    "text.remove_separators": definition(
        "text.remove_separators",
        "Remove Formatting Separators",
        "text",
    ),

    "column.to_numeric": definition(
        "column.to_numeric",
        "Convert to Numeric",
        "conversion",
        changes_schema=True,
    ),

    "column.to_datetime": definition(
        "column.to_datetime",
        "Convert to Datetime",
        "conversion",
        changes_schema=True,
    ),
}


class UnsupportedChange(Exception):
    """Raised for an unregistered dataset operation."""


def get_change_definition(
    kind: str,
) -> ChangeDefinition:
    operation = CHANGE_REGISTRY.get(kind)

    if operation is None:
        raise UnsupportedChange(
            f"Unsupported dataset operation: {kind}"
        )

    return operation


def list_change_definitions() -> list[ChangeDefinition]:
    """Return supported mutations in registry order."""

    return list(CHANGE_REGISTRY.values())