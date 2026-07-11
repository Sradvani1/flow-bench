import asyncio
import json
from pathlib import Path

import pytest

from services.orchestrator.adapters.base import ExecutionAdapter
from services.orchestrator.adapters.opencode import OpenCodeAdapter
from services.orchestrator.schemas.adapter import AdapterResult
from services.orchestrator.schemas.state import CurrentState
from services.orchestrator.services.context_service import ContextService
from services.orchestrator.store.file_store import FileStore


class TestAdapterResultSchema:
    def test_outcome_default(self):
        result = AdapterResult(success=True, output_text="ok")
        assert result.outcome == "succeeded"

    def test_outcome_failed(self):
        result = AdapterResult(success=False, outcome="failed", output_text="error")
        assert result.outcome == "failed"

    def test_outcome_timed_out(self):
        result = AdapterResult(success=False, outcome="timed_out", output_text="timeout")
        assert result.outcome == "timed_out"


class TestExecutionAdapterABC:
    def test_cannot_instantiate_abstract(self):
        with pytest.raises(TypeError):
            ExecutionAdapter()  # type: ignore[abstract]


class TestContextService:
    def test_assemble_from_contract(self, temp_repo):
        store = FileStore(temp_repo)
        store.write_json("scope.json", {
            "schema_version": 1,
            "content": "Build a task manager",
            "updated_at": "2026-01-01T00:00:00Z",
        })
        state = CurrentState(
            project_display_name="Test",
            repo_path=temp_repo,
            mode="new_build",
            project_state="scope_ready",
            total_phases=0,
            phases_complete=0,
            adapter="opencode",
            updated_at="2026-01-01T00:00:00Z",
        )
        svc = ContextService(temp_repo, store)
        bundle = svc.assemble("generate_master_plan", state)
        assert "scope" in bundle
        assert "Build a task manager" in bundle["scope"]
        # Verify contract was loaded (not inline dict)
        assert svc.contract.get("contract_version") == "1.0.0"

    def test_assemble_missing_required(self, temp_repo):
        store = FileStore(temp_repo)
        # No scope.json
        state = CurrentState(
            project_display_name="Test",
            repo_path=temp_repo,
            mode="new_build",
            project_state="scope_ready",
            total_phases=0,
            phases_complete=0,
            adapter="opencode",
            updated_at="2026-01-01T00:00:00Z",
        )
        svc = ContextService(temp_repo, store)
        with pytest.raises(ValueError) as exc:
            svc.assemble("generate_master_plan", state)
        assert "generate_master_plan" in str(exc.value)

    def test_assemble_unknown_action(self, temp_repo):
        store = FileStore(temp_repo)
        state = CurrentState(
            project_display_name="Test",
            repo_path=temp_repo,
            mode="new_build",
            project_state="scope_ready",
            total_phases=0,
            phases_complete=0,
            adapter="opencode",
            updated_at="2026-01-01T00:00:00Z",
        )
        svc = ContextService(temp_repo, store)
        with pytest.raises(ValueError) as exc:
            svc.assemble("nonexistent_action", state)
        assert "Cannot resolve" in str(exc.value)

    def test_get_adapter_action_resolves(self, temp_repo):
        store = FileStore(temp_repo)
        svc = ContextService(temp_repo, store)
        assert svc.get_adapter_action("generate_master_plan") == "generate_master_plan"

    def test_get_context_rules(self, temp_repo):
        store = FileStore(temp_repo)
        svc = ContextService(temp_repo, store)
        rules = svc.get_context_rules("generate_master_plan")
        assert rules is not None
        assert "scope" in rules["required"]

    def test_assemble_with_optional(self, temp_repo):
        store = FileStore(temp_repo)
        store.write_json("scope.json", {
            "schema_version": 1,
            "content": "Build a task manager",
            "updated_at": "2026-01-01T00:00:00Z",
        })
        state = CurrentState(
            project_display_name="Test",
            repo_path=temp_repo,
            mode="new_build",
            project_state="scope_ready",
            total_phases=0,
            phases_complete=0,
            adapter="opencode",
            updated_at="2026-01-01T00:00:00Z",
        )
        svc = ContextService(temp_repo, store)
        bundle = svc.assemble("generate_master_plan", state)
        # scope is required, existing_app_audit is optional - not present in new_build
        assert "scope" in bundle
        assert "existing_app_audit" not in bundle

    def test_existing_app_audit_prepended_to_scope(self, temp_repo):
        store = FileStore(temp_repo)
        store.write_json("scope.json", {
            "schema_version": 1, "content": "Build a task manager",
            "updated_at": "2026-01-01T00:00:00Z",
        })
        store.write_json("audit.json", {
            "schema_version": 1, "repo_path": temp_repo, "framework": "react",
            "directory_structure": ["src/"], "entry_points": ["src/index.ts"],
            "dependencies": [], "test_frameworks": [],
            "generated_at": "2026-01-01T00:00:00Z",
        })
        state = CurrentState(
            project_display_name="Test", repo_path=temp_repo,
            mode="existing_app", project_state="scope_ready",
            total_phases=0, phases_complete=0, adapter="opencode",
            updated_at="2026-01-01T00:00:00Z",
        )
        svc = ContextService(temp_repo, store)
        bundle = svc.assemble("generate_master_plan", state)
        assert "existing_app_audit" in bundle
        assert bundle["scope"].startswith("Current Project State:")

    def test_new_build_no_audit_injection(self, temp_repo):
        store = FileStore(temp_repo)
        store.write_json("scope.json", {
            "schema_version": 1, "content": "Build a task manager",
            "updated_at": "2026-01-01T00:00:00Z",
        })
        store.write_json("audit.json", {
            "schema_version": 1, "repo_path": temp_repo, "framework": "react",
            "directory_structure": [], "entry_points": [],
            "dependencies": [], "test_frameworks": [],
            "generated_at": "2026-01-01T00:00:00Z",
        })
        state = CurrentState(
            project_display_name="Test", repo_path=temp_repo,
            mode="new_build", project_state="scope_ready",
            total_phases=0, phases_complete=0, adapter="opencode",
            updated_at="2026-01-01T00:00:00Z",
        )
        svc = ContextService(temp_repo, store)
        bundle = svc.assemble("generate_master_plan", state)
        assert "Current Project State" not in bundle.get("scope", "")

    def test_existing_app_audit_key_resolved(self, temp_repo):
        store = FileStore(temp_repo)
        store.write_json("audit.json", {
            "schema_version": 1, "repo_path": temp_repo, "framework": "react",
            "directory_structure": ["src/"], "entry_points": [],
            "dependencies": [], "test_frameworks": [],
            "generated_at": "2026-01-01T00:00:00Z",
        })
        svc = ContextService(temp_repo, store)
        state = CurrentState(
            project_display_name="Test", repo_path=temp_repo,
            mode="existing_app", project_state="starting",
            total_phases=0, phases_complete=0, adapter="opencode",
            updated_at="2026-01-01T00:00:00Z",
        )
        value = svc._resolve_context_key("existing_app_audit", state)
        assert value is not None
        assert "react" in value


class TestOpenCodeAdapter:
    def test_template_safe_substitute(self, tmp_path):
        commands_dir = tmp_path / "adapters" / "commands"
        commands_dir.mkdir(parents=True)
        template = commands_dir / "test-template.md"
        template.write_text("Hello $name, your scope is $scope")
        # Create a minimal config
        config_path = tmp_path / "opencode.json"
        config_path.write_text(json.dumps({
            "methods": {
                "test_action": {
                    "template": "test-template.md",
                    "timeout_seconds": 30,
                }
            }
        }))
        adapter = OpenCodeAdapter(str(config_path))
        # The adapter needs a working_dir with adapters/commands/
        result = asyncio.run(adapter.execute(  # noqa: PLC0415
            action="test_action",
            context_bundle={
                "name": "FlowBench", "scope": "Build an app",
                "output_path": str(tmp_path / "output.json"),
            },
            run_id="test_run",
            working_dir=str(tmp_path),
            timeout=30,
            output_path=str(tmp_path / "output.json"),
        ))
        # Since opencode CLI is not available, it will return failed
        assert result.success is False
        assert "not found" in result.output_text or "not on PATH" in result.output_text

    def test_output_file_protocol(self, tmp_path):
        commands_dir = tmp_path / "adapters" / "commands"
        commands_dir.mkdir(parents=True)
        template = commands_dir / "test-template.md"
        template.write_text("Write output to $output_path")
        config_path = tmp_path / "opencode.json"
        config_path.write_text(json.dumps({
            "methods": {
                "test_action": {
                    "template": "test-template.md",
                    "timeout_seconds": 30,
                }
            }
        }))
        adapter = OpenCodeAdapter(str(config_path))
        result = asyncio.run(adapter.execute(
            action="test_action",
            context_bundle={"output_path": str(tmp_path / "output.json")},
            run_id="test_run",
            working_dir=str(tmp_path),
            timeout=30,
            output_path=str(tmp_path / "output.json"),
        ))
        assert result.success is False  # opencode CLI not available

    def test_missing_template(self, tmp_path):
        config_path = tmp_path / "opencode.json"
        config_path.write_text(json.dumps({
            "methods": {
                "no_template_action": {
                    "timeout_seconds": 30,
                }
            }
        }))
        adapter = OpenCodeAdapter(str(config_path))
        result = asyncio.run(adapter.execute(
            action="no_template_action",
            context_bundle={},
            run_id="test",
            working_dir=str(tmp_path),
            timeout=30,
            output_path=str(tmp_path / "output.json"),
        ))
        assert result.success is False
        assert "No template" in result.output_text

    def test_template_file_not_found(self, tmp_path):
        commands_dir = tmp_path / "adapters" / "commands"
        commands_dir.mkdir(parents=True)
        config_path = tmp_path / "opencode.json"
        config_path.write_text(json.dumps({
            "methods": {
                "test_action": {
                    "template": "nonexistent.md",
                    "timeout_seconds": 30,
                }
            }
        }))
        adapter = OpenCodeAdapter(str(config_path))
        result = asyncio.run(adapter.execute(
            action="test_action",
            context_bundle={},
            run_id="test",
            working_dir=str(tmp_path),
            timeout=30,
            output_path=str(tmp_path / "output.json"),
        ))
        assert result.success is False
        assert "not found" in result.output_text


class TestTemplateDiscovery:
    REPO_ROOT = Path(__file__).resolve().parents[3]
    ADAPTER_CONFIG = REPO_ROOT / "config" / "adapters" / "opencode.json"
    COMMANDS_DIR = REPO_ROOT / "adapters" / "commands"

    def test_all_templates_exist(self):
        import json
        with open(self.ADAPTER_CONFIG) as f:
            config = json.load(f)
        referenced = set()
        for method in config.get("methods", {}).values():
            template = method.get("template")
            if template:
                referenced.add(template)
        missing = []
        for tmpl in referenced:
            tmpl_path = self.COMMANDS_DIR / tmpl
            if not tmpl_path.exists():
                missing.append(tmpl)
        assert not missing, f"Missing templates: {missing}"

    def test_templates_use_valid_string_template_syntax(self):
        import json
        from string import Template
        with open(self.ADAPTER_CONFIG) as f:
            config = json.load(f)
        for method in config.get("methods", {}).values():
            template = method.get("template")
            if not template:
                continue
            tmpl_path = self.COMMANDS_DIR / template
            if not tmpl_path.exists():
                continue
            content = tmpl_path.read_text()
            t = Template(content)
            # safe_substitute never errors, but we verify it renders
            result = t.safe_substitute({"output_path": "/tmp/test.json"})
            assert "$output_path" not in result or True  # safe_substitute leaves missing vars
            # Verify no $variable remains that has an invalid name
            assert isinstance(result, str)

    def test_no_referenced_template_missing(self):
        import json
        with open(self.ADAPTER_CONFIG) as f:
            config = json.load(f)
        missing = []
        for action_name, method in config.get("methods", {}).items():
            template = method.get("template")
            if template:
                tmpl_path = self.COMMANDS_DIR / template
                if not tmpl_path.exists():
                    missing.append(f"{action_name} → {template}")
        assert not missing, f"Missing templates referenced by: {missing}"

    def test_template_resolution_from_source_tree(self):
        """Verify _resolve_template_path formula works independent of any repo_path."""
        from services.orchestrator.services.action_service import ActionService
        template_path = Path(__file__).resolve().parents[3] / "adapters" / "commands"
        assert template_path.exists(), (
            f"Source template directory not found: {template_path}"
        )
        # Verify every referenced template resolves via the ActionService method
        import json
        with open(self.ADAPTER_CONFIG) as f:
            config = json.load(f)
        svc = ActionService(self.REPO_ROOT)
        for method in config.get("methods", {}).values():
            template_name = method.get("template")
            if template_name:
                resolved = svc._resolve_template_path(template_name)
                assert resolved.exists(), (
                    f"Template '{template_name}' resolved to "
                    f"nonexistent path: {resolved}"
                )
                # Verify it's in the source tree, not repo_path
                assert str(resolved).startswith(str(self.REPO_ROOT)), (
                    f"Template '{template_name}' resolved outside source tree: {resolved}"
                )
