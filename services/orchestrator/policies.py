import json
from pathlib import Path

from services.orchestrator.store.app_config import read_app_config, set_config_base_override


def _load_policies_from_disk() -> dict:
    config_base = Path(__file__).resolve().parents[2] / "config"
    path = config_base / "policies.json"
    with open(path) as f:
        return json.load(f)


def load_policies() -> dict:
    # Read from app config store (install config/) on every call so runtime edits apply immediately.
    # Falls back to config/policies.json if not found in app config.
    data = read_app_config("policies.json")
    if data is not None:
        return data
    return _load_policies_from_disk()


def requires_confirmation(risk_category: str) -> bool:
    policies = load_policies()
    cat = policies.get("risk_categories", {}).get(risk_category, {})
    return cat.get("requires_confirmation", False)


def get_risk_explanation(risk_category: str, action_entry: dict | None = None) -> str:
    if action_entry and action_entry.get("risk_explanation"):
        return action_entry["risk_explanation"]
    policies = load_policies()
    cat = policies.get("risk_categories", {}).get(risk_category, {})
    return cat.get("default_explanation", "Proceed with caution.")


def get_category(risk_category: str) -> dict | None:
    policies = load_policies()
    return policies.get("risk_categories", {}).get(risk_category)


__all__ = [
    "load_policies",
    "requires_confirmation",
    "get_risk_explanation",
    "get_category",
    "set_config_base_override",
    "_load_policies_from_disk",
]
