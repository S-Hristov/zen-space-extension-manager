> Historical development report. See [current publication validation](PUBLICATION-CHECKS.md) for the latest rerun.

# Validation — 2026-11-06

- **37 Node tests passed**: policy, stable IDs, default-off/unmanaged, sensitive acknowledgements, native permission adapter, rapid 20-switch coalescing, multi-window in-flight compensation, original enabled/disabled baselines, manual overrides, resets, storage failure/corruption, missing Spaces, startup recovery, clean persistence, global suspension. See node-results.txt.
- **47 native browser assertions passed** in installed Zen 1.24b, headless, separate empty signed-out profile. See browser-results.json. Real native APIs, not a browser simulation.
- Native coverage: four synthetic WebExtensions (background/storage/content script + toolbar, toolbar-only, devtools-page fixture, sensitive-name fixture); lifecycle metadata and actual enable/disable; background destruction/startup; native browser-action widget availability; storage sentinel survives toggles; already-injected DOM remains after disable; selected tab/URL/container preservation; 20 actual Space switches; two actual windows; chrome matrix rendering and Save edits; manual native override; own journal permissions; actual browser shutdown/restart; stable saved mappings; generated bootstrap and awaited Sine-style unload cleanup.
- Final shutdown outcome: **restored**, empty durable journal. A native startup error after restoration of the original enabled flag is handled without falsely leaving a restore-blocked journal. Real permission/provider failures still freeze automation and retain recovery metadata.
- Initial headless startup encountered macOS updater authorization before profile initialization. No authorization was granted or helper installed. Harness now uses Gecko's supported **process-local** MOZ_DISABLE_UPDATE_PROCESSING=1, preventing the test from updating the app. No installed update settings changed.

## Not verified / not claimed

- Real uBlock Origin, 1Password and React Developer Tools were **not** installed/toggled. Synthetic categories establish manager lifecycle mechanics, not product compatibility, vault unlock behavior, rule-engine state, native-host behavior or functional developer panels.
- No real login/cookie/password data was used. Production code contains no cookie clearing, storage deletion or tab reload operations, but this cannot certify every third-party extension's restart side effects.
- No full Sine installer marketplace E2E or Windows/Linux UI test. Sine's observed loader/unload contract is exercised through a browser-chrome harness; actual live profile remains untouched.
- No adversarial security isolation test: isolation is not implemented and is explicitly disclaimed.
- Crash cases are deterministic write-ahead journal simulations, not a forced OS kill during a real password manager operation.
- Timing in browser-results.json includes Zen's native transitions; no claim that native layouts/Spaces or extension startup are zero latency. Our Space callback returns without awaiting lifecycle operations.

## 0.1.1 validation

Retested in Zen 1.24.1b. New tests cover opt-in global disable with two native normal windows, one native private window, unchanged unmanaged sensitive fixture, remaining-Space resume, checkbox save/persistence, original enabled/disabled baselines, missing acknowledgements/manual overrides, window churn, native-error hold, interrupted-startup review, no implicit re-enable on unload, and backward-compatible old configs. Real 1Password credentials/storage are never read by the test suite.
