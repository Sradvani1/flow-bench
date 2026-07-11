import asyncio
import json
from pathlib import Path
from string import Template

from services.orchestrator.adapters.base import ExecutionAdapter
from services.orchestrator.schemas.adapter import AdapterResult


class OpenCodeAdapter(ExecutionAdapter):
    def __init__(self, config_path: str | None = None):
        self.config = self._load_config(config_path)

    def _load_config(self, config_path: str | None = None) -> dict:
        if config_path is None:
            path = (
                Path(__file__).resolve().parents[3]
                / "config"
                / "adapters"
                / "opencode.json"
            )
        else:
            path = Path(config_path)
        with open(path) as f:
            return json.load(f)

    async def execute(
        self,
        action: str,
        context_bundle: dict[str, str],
        run_id: str,
        working_dir: str,
        timeout: int,
        output_path: str,
    ) -> AdapterResult:
        method_config = self.config.get("methods", {}).get(action, {})
        template_name = method_config.get("template", "")
        timeout_seconds = method_config.get("timeout_seconds", timeout)

        if not template_name:
            return AdapterResult(
                success=False,
                outcome="failed",
                output_text=f"No template configured for action '{action}'",
            )

        template_path = Path(working_dir) / "adapters" / "commands" / template_name

        if not template_path.exists():
            return AdapterResult(
                success=False,
                outcome="failed",
                output_text=f"Template file not found: {template_path}",
            )

        try:
            template_content = template_path.read_text()
        except OSError as e:
            return AdapterResult(
                success=False,
                outcome="failed",
                output_text=f"Cannot read template {template_path}: {e}",
            )

        rendered = Template(template_content).safe_substitute(context_bundle)

        prompt_dir = Path(working_dir) / ".flowbench" / "runs" / run_id
        prompt_dir.mkdir(parents=True, exist_ok=True)
        prompt_path = prompt_dir / "prompt.md"
        prompt_path.write_text(rendered)

        try:
            proc = await asyncio.create_subprocess_exec(
                "opencode", "run", str(prompt_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir,
            )
        except FileNotFoundError:
            return AdapterResult(
                success=False,
                outcome="failed",
                output_text="opencode CLI not found on $PATH",
            )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_seconds
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return AdapterResult(
                success=False,
                outcome="timed_out",
                output_text=f"Timed out after {timeout_seconds}s",
            )

        output_file = Path(output_path)
        if output_file.exists():
            try:
                raw = output_file.read_text()
                structured_result = json.loads(raw)
                if not isinstance(structured_result, dict):
                    raise ValueError("Output is not a JSON object")
                return AdapterResult(
                    success=True,
                    outcome="succeeded",
                    output_text=json.dumps(structured_result),
                    artifact_path=str(output_file),
                )
            except (json.JSONDecodeError, ValueError, OSError) as e:
                stdout_text = stdout.decode() if stdout else ""
                return AdapterResult(
                    success=False,
                    outcome="failed",
                    output_text=(
                        f"Structured output at {output_path} is invalid: {e}\n"
                        f"stdout: {stdout_text}"
                    ),
                    artifact_path=None,
                )

        stdout_text = stdout.decode() if stdout else ""
        return AdapterResult(
            success=False,
            outcome="failed",
            output_text=stdout_text or "No structured output produced",
            artifact_path=None,
        )
