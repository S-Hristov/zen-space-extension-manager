# Per-Space Extension Manager — Convenience Mode

Independent Sine mod for Zen 1.24b. Version 0.1.1. **Default OFF; every extension starts unmanaged.** No native browser patch needed.

> **NOT security isolation.** Extensions are enabled/disabled globally in the profile, asynchronously after a Space change. An enabled extension can still access permitted data in other Spaces. Company/personal isolation requires separate profiles and appropriate account policies.

## Features

- Tools → **Space Extension Manager (Convenience Mode)…** opens a native browser-chrome configuration matrix.
- Map stable extension IDs to stable Space UUIDs: enabled everywhere, allowed only in selected Spaces, disabled in selected Spaces, or unmanaged.
- Explicit global-scope acknowledgement and separate security/password-manager acknowledgement.
- One serialized queue per profile; 75 ms event debounce, newest-Space reconciliation, no awaited extension work in Zen's Space navigation listener.
- Current global state, API-permission names, conflicts, bounded state-change history, per-rule reset, suspension and recovery controls.
- Durable write-ahead original-state journal, manual-change precedence, crash recovery, clean shutdown/unload restoration.
- Default multi-window availability pause, plus an opt-in privacy guard that globally disables configured extensions until one ready normal window remains. Neither is isolation.

## Install with Sine

In Sine's repository installer, enter **`S-Hristov/zen-space-extension-manager`** (or [https://github.com/S-Hristov/zen-space-extension-manager](https://github.com/S-Hristov/zen-space-extension-manager)). The repository root contains `theme.json`. This is a community, unreviewed privileged-JavaScript mod, not an approved Sine Store listing. Review source and back up your profile first.

Sine must explicitly permit unverified JavaScript; that permission permits other unverified Sine scripts too. Review all enabled scripts. No browser-bundle edits, re-signing, or weakened extension signing are needed. Restart Zen if Sine requests it. Configure this mod independently; installing it installs no companion mods. ZIPs are source archives, not XPI files or an assumed Sine local-ZIP import format.

## Configure

1. Open Tools → Space Extension Manager.
2. Leave critical protection extensions unmanaged unless you explicitly want their protection interrupted.
3. Select an extension's rule and Space checkboxes. “Allow selected” with no checkboxes disables it everywhere; “Disable selected” with none enables it everywhere. “Enabled everywhere” explicitly manages/enables it, including if originally disabled.
4. Acknowledge profile-global convenience behavior; acknowledge sensitive rules individually.
5. Enable automation and **Save & apply globally**.

Space names can change; rules use UUIDs. A deleted/unknown Space blocks its rule instead of guessing a replacement. Reset and recreate that mapping. Configuration is device-local; do not copy it to another profile unless its Space UUIDs actually match.

Suspension / automation off / reset are explicit **global** restore actions. A manual extension change wins; its conflict is not automatically retried. Reset the rule to release ownership, then configure a new rule if desired. Permission/policy-blocked extensions are not bypassed.

## Multi-window contract

**New optional privacy guard:** select “Multi-window privacy guard” and Save. With extra normal/private/Little Zen browser windows open, every explicitly managed, supported, acknowledged extension is disabled **globally**, including “Enabled everywhere” rules. Unmanaged extensions are untouched. This can interrupt passwords, filtering or developer tools in all windows: leave critical protection extensions unmanaged unless that interruption is intended.

When exactly one ready normal window remains, saved rules for **that remaining window’s current Space** resume. This is not a blind restore of an old ON flag: if the remaining window is Work rather than Lenderlink, a Lenderlink-only extension stays disabled. Pending/unclassified windows freeze transitions. Manual overrides and native policy still win and are shown as conflicts; this is best-effort asynchronous behavior, not a security boundary.

A guard lifecycle error freezes automation and holds existing disables/journal for explicit review instead of auto-enabling original states. A surviving guard journal after an interrupted shutdown also requires review. Explicit recovery/off/reset can restore original flags globally. See RECOVERY.md.

**Default availability-preserving policy (guard OFF):**

Automatic switching requires exactly one normal browser window, no private browser windows, and a ready known Space model. Little Zen browser windows also count. Unknown/loading windows freeze transitions until classified.

With multiple/private/unready windows:
- Undo manager-owned disables of originally-enabled extensions.
- Keep manager-owned enables of originally-disabled extensions enabled; automatically disabling those could break another window. Reconcile them after returning to one ready normal window.
- Show the paused state. This can temporarily provide **more** availability, never per-window isolation.

An already-running native lifecycle operation cannot be canceled atomically when another window opens. The serialized next pass compensates; there is no zero-duration race/security guarantee.

## State, uninstall and recovery

See [RECOVERY.md](docs/RECOVERY.md). Own profile file: `zen-space-extension-manager.json`, format version 1, owner-only permissions on macOS. It contains rules, Space/add-on IDs, original enabled flags, pending operations, conflicts and the last 100 change events; no tab URLs, page content, cookies, passwords or extension storage.

Turn automation OFF, save, confirm original states and an empty journal, then disable/remove this mod through Sine. An awaited Sine unload restores owned states and removes listeners/UI. Clean browser shutdown attempts restoration using `AddonManager.beforeShutdown`. Manual/policy conflicts may require intervention in `about:addons`; do not delete the journal before recovery.

## Build and test

No npm dependencies. Node with `node:test` and `structuredClone` support; Python 3 for optional native tests.

```sh
npm run check
python3 tests/browser_smoke.py --binary /Applications/Zen.app/Contents/MacOS/zen
python3 scripts/package.py
```

Run inside the extracted project directory. Native tests launch a separate headless Zen with an empty temporary profile, loopback test page and synthetic test-only extensions. Never point them at a real profile. Test installers exist only under `tests/`, not in runtime code.

`src/policy.mjs` → pure validated policy; `src/controller.mjs` → serialized journal/lifecycle; `src/addons.sys.mjs` → native adapter; `src/runtime.sys.mjs` → browser/Space hooks; `src/ui.mjs` → browser-chrome UI. Build emits one version-named ESM so future version updates do not accidentally reuse cached old module code. Keep package/manifest/userscript versions aligned when releasing.

See [SECURITY.md](docs/SECURITY.md), [RESEARCH.md](docs/RESEARCH.md), [TESTING.md](docs/TESTING.md). MIT license.

## Publication checks

See [current validation](docs/PUBLICATION-CHECKS.md). Earlier reports describe their historical test run, not additional platform certification.
