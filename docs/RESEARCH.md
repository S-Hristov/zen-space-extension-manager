# Verified interfaces — 2026-11-06

Target: Zen 1.24b, BuildID 20261029123729, SourceStamp f75390aa2b797ddc3524ff9ed52ceb32a839f9fa. Sine 2.3.4.1c. Actual installed archives and checked-out source were inspected read-only; no app-bundle modification.

- Zen's `src/zen/spaces/ZenSpaceManager.mjs`: `gZenWorkspaces.promiseInitialized`, `activeWorkspace`, `getWorkspaces()`, **addChangeListeners/removeChangeListeners**. Native change dispatch awaits callbacks, so our callback only schedules work and returns immediately. No assumed `ZenWorkspaceChanged` event. Metadata refresh uses observed native `ZenWorkspacesUIUpdate` / `ZenWorkspaceDataChanged`.
- Gecko `modules/AddonManager.sys.mjs`, `modules/addons/XPIDatabase.sys.mjs` / `XPIProvider.sys.mjs`: getAddonsByTypes/getAddonByID, add/removeAddonListener, wrapper enable/disable({allowSystemAddons:false}), PERM_CAN_ENABLE/PERM_CAN_DISABLE, restart/pending/blocklist metadata. `AddonManager.beforeShutdown` is the barrier before providers shut down; it can await final native lifecycle work.
- `ext-management.js`: an ordinary extension cannot freely control arbitrary other extensions. Firefox restricts setEnabled targets/callers (including theme and enterprise-installed caller paths). This mod deliberately uses trusted Sine chrome privileges instead, while honoring native provider policy.
- `ExtensionContent.sys.mjs`, DocumentManager.shutdownExtension: contexts close on native disable. That does not undo previous DOM mutations or collected data. Native fixture tests explicitly check persistent DOM after disable.
- Sine manager's repository flow downloads/extracts a GitHub archive, honors scripts/includes and awaits unload callbacks. It does not justify advertising arbitrary local ZIP import. Browser module is version-named to avoid ESM cache reuse on later releases.

Primary references:
- [Zen source](https://github.com/zen-browser/desktop)
- [Sine source](https://github.com/CosmoCreeper/Sine)
- [Firefox Add-on Manager docs](https://firefox-source-docs.mozilla.org/toolkit/mozapps/extensions/addon-manager/index.html)
- [Firefox management.setEnabled restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/setEnabled)
- [Contextual identities and cookie partitions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Work_with_contextual_identities)
- [Tabs API and permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Working_with_the_Tabs_API)
- [1Password official per-site autofill controls](https://support.1password.com/autofill-behavior/)
- [1Password official vault-selection feature announcement](https://1password.com/blog/product-update-features-and-security-q3-2024)

The isolation assessment in SECURITY.md is engineering inference from these API scopes and native implementation, not an official claim of certification by Mozilla/Zen/1Password. No security-critical third-party add-on was modified or toggled for this research.
