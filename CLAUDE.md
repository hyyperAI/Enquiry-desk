# CLAUDE.md

## Context lookup: graph first

A knowledge graph of this project exists at `graphify-out/graph.json` (summary in `graphify-out/GRAPH_REPORT.md`).

- Before reading source files to answer a question about this codebase, query the graph first: `graphify query "<question>"` (add `--budget 1500` to cap output). Use `graphify path "A" "B"` or `graphify explain "X"` for targeted lookups.
- Only open raw files when the graph doesn't cover it, or when you need exact lines to edit. Use the graph's `source_location` to read just that part.
- For a single known symbol ("where is X defined"), a plain Grep is fine.
- After meaningful code or doc changes, run `/graphify --update` so the graph stays current.
