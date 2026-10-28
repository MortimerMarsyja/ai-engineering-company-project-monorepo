"""Generate Pydantic v2 models for the telemetry event contract.

Source of truth: ../../docs/event-schemas.json (JSON Schema draft-07,
defined in Fase 2 of the telemetry plan — see docs/event-envelope.md).
Output: app/models/events.py — a GENERATED file, do not edit by hand.

Usage (via uv):
    uv run --extra codegen generate-events
"""

from __future__ import annotations

from pathlib import Path

from datamodel_code_generator import DataModelType, InputFileType, PythonVersion, generate

SCHEMA_PATH = Path(__file__).resolve().parent.parent.parent / "docs" / "event-schemas.json"
OUTPUT_PATH = Path(__file__).resolve().parent / "app" / "models" / "events.py"

HEADER = '''"""GENERATED FILE — DO NOT EDIT.

Regenerate with: uv run --extra codegen generate-events
Source of truth: docs/event-schemas.json (see docs/event-envelope.md for the
full contract documentation — envelope fields, per-event properties, and the
privacy/design decisions behind each one).
"""

'''


def generate_models() -> None:
    generate(
        SCHEMA_PATH,
        input_file_type=InputFileType.JsonSchema,
        output=OUTPUT_PATH,
        output_model_type=DataModelType.PydanticV2BaseModel,
        target_python_version=PythonVersion.PY_311,
        use_schema_description=True,
        use_field_description=True,
        collapse_root_models=True,
        use_double_quotes=True,
    )

    generated = OUTPUT_PATH.read_text(encoding="utf-8")
    if not generated.startswith('"""GENERATED FILE'):
        OUTPUT_PATH.write_text(HEADER + generated, encoding="utf-8")


def main() -> None:
    print(f"Generating Pydantic models from {SCHEMA_PATH} ...")
    generate_models()
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
