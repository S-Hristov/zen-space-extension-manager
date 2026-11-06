# Recovery / safe removal

1. Open Tools → Space Extension Manager. **Restore originals / retry recovery** disables automation and attempts one serialized restoration of manager-owned flags.
2. Review conflicts and native `about:addons`. Manual changes are kept, not undone. Policy-blocked operations are never bypassed. Reset a manual-conflict rule to release it before reassigning.
3. For emergency suspension, enable Sine's **Emergency suspension** preference for this mod. This requests global original-state restoration while keeping saved rules. Turning that preference off resumes only if automation was enabled and no failsafe has disabled it.
4. Confirm original extension states, then remove only this Sine mod. Do not remove other mods or replace Sine's registry.

## Crash / interrupted shutdown

A durable surviving journal is treated as interrupted shutdown. On the next mod startup, automation is set OFF before one best-effort restoration pass. The original rule mapping remains. Re-enable manually after reviewing conflicts. A clean shutdown attempts to restore originals first and preserves your explicit enabled setting for the next clean launch.

State file in your selected Zen profile (created when configured):
`<profile>/zen-space-extension-manager.json`

Copy **this one file** to a private backup before manual recovery, with Zen closed by you. It can expose Space/add-on IDs, so do not publish it. Entries under `journal` hold `baselineDisabled`: false = originally enabled; true = originally disabled. `pending` records intent before a native call; it does not prove that the call succeeded.

If the file is corrupt, an unknown version, unreadable or unwritable: automation freezes. It does not guess defaults or overwrite unreadable state. Use a valid private backup or restore known original flags in `about:addons` manually. After confirming every original flag, move the broken file aside privately and start fresh with automation OFF. Never delete an unresolved journal simply to hide a warning.

Native restoration blocked by enterprise policy, removed extensions, shutdown failure or a hanging third-party lifecycle can require manual intervention. There is no retry loop. Recovery never reinstalls a removed extension, clears its storage, deletes cookies or changes passwords. Manual changes that do not generate distinguishable native state events cannot be perfectly attributed; inspect native states after unusual failures.

Do not publish profile archives, preferences, extension databases, recovery journals or passwords. Distribution packaging is a whitelist of this project's code, docs and tests only.

## Privacy guard enabled

A native error or interrupted guard journal does **not** automatically re-enable original extension flags. Automation stops with `privacy-guard-error-review-required` or `multi-window-recovery-required`. Existing flags/journal are held across automatic Sine/browser unload. Review windows/Space, native `about:addons` and conflicts; explicitly save a valid configuration to resume policy, or use Restore originals / retry recovery to restore the baseline globally. That recovery action can enable an extension outside its assigned Space; it deliberately disables automation until you review/re-enable it. Manual overrides are not fought. No policy can guarantee disabled state if Firefox denies disabling or the user manually overrides it.
