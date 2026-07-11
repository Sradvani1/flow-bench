You are auditing an existing codebase at $repo_path.

Scan the repository and produce a structured audit report covering:
1. Project structure and framework detection
2. Entry points and module organization
3. Dependencies and package management
4. Test infrastructure and coverage patterns
5. Git history and branching strategy

Write your complete structured output to $output_path as a JSON file
conforming to this schema:

- repo_path (string, required): the canonical path of the audited repo
- framework (string or null): detected framework
- directory_structure (array of strings): key file paths relative to repo root
- entry_points (array of strings): module entry points
- dependencies (array of objects): each with name, version, type fields
- test_frameworks (array of strings): detected test tools
- git_info (object or null): with branch, last_commit, has_uncommitted fields
- generated_at (ISO 8601 string, required): when the audit was produced
