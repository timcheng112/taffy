# Conditional review lanes

Frontend: check feature public interfaces, direct imports, effect/derived state, Query keys/invalidation, waterfalls, semantic interaction, typed errors, and behavior tests. Native: check thin commands, Rust authority, typed errors, SQL constraints/parameters, transaction/rollback, migrations, clocks, and IPC compatibility. Security: trace the webview-to-Rust trust boundary and least-privilege capabilities for changed filesystem, process, URL/HTML, SQL, permission, secret, or unsafe behavior.

Use official React/TanStack/Vercel, Rust/SQLite/Tauri guidance only for the active lane. Findings must be changed-code relevant and reproducible.
