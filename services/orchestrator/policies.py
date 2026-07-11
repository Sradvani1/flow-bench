import json
from functools import cache
from pathlib import Path


@cache
def load_policies() -> dict:
    path = Path(__file__).resolve().parent.parent.parent / "config" / "policies.json"
    with open(path) as f:
        return json.load(f)


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
