from abc import ABC, abstractmethod

from services.orchestrator.schemas.adapter import AdapterResult


class ExecutionAdapter(ABC):
    @abstractmethod
    async def execute(
        self,
        action: str,
        context_bundle: dict[str, str],
        run_id: str,
        working_dir: str,
        timeout: int,
        output_path: str,
    ) -> AdapterResult:
        ...
