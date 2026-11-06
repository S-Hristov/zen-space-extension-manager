# Security model and limits

## Mode A — implemented, Convenience Mode

Uses privileged native AddonManager lifecycle operations on explicitly selected installed WebExtensions. Native extension disable/enable affects the entire profile. The mod never installs, uninstalls or alters another extension's code/settings/storage. Add-on provider permission flags, compatibility, blocklist, pending/restart state and system/builtin/privileged status are checked before every mutation. Enterprise policy is not overridden.

Sine scripts are browser-privileged code, outside ordinary WebExtension permissions. Treat this mod and updates as trusted executable software. No new page messaging API, localhost listener or web-accessible resource is part of the **runtime**. The loopback server belongs only to the optional test harness. UI uses textContent, not HTML interpolation.

Transition work is asynchronous. Space switching stays independent of lifecycle completion; extension toggling may finish later. No guaranteed instant enforcement, atomic transition, content rollback or cancellation of in-flight native operations. Native extension startup can have third-party side effects, including reauthentication; do not promise uninterrupted password-manager unlock, protection, logins or devtools state. The mod does not clear cookies, reload tabs, change containers or log users out itself.

## Mode B — not available through existing single-profile APIs

| Capability | What this mod can do | What it cannot isolate |
|---|---|---|
| Content scripts | Native disable destroys extension contexts | Already-modified DOM/data already read; no per-Space injection boundary |
| Background/service contexts | Global native shutdown/startup | An enabled background's permitted access to other Spaces |
| Network | Globally stop extension execution | Space-specific webRequest/proxy/native-host capabilities |
| Storage | Leave storage untouched | Partition extension local/sync/session storage by Space |
| Tabs/history | No runtime enumeration of tab URLs | Restrict another enabled extension's authorized tab/history queries |
| Containers | Read Space UUID/name only; never change identity | Turn cookie containers into extension/process capability boundaries |
| Messaging | No interception/spoofing | Partition another extension's internal/external/native messages |
| Credentials/autofill | Globally disable an opted-in manager | Undo credential access or control an external native desktop agent |
| Privileged APIs | Honor native permission gates | Retrofit safe per-Space capability enforcement across arbitrary extensions |
| Persistence/processes | Journal own lifecycle state | Erase previously collected data or split the profile's extension security principal |

This conclusion follows from the native profile-global lifecycle and the absence of a supported Space-aware restriction across all these APIs. Container cookie partitioning and permission-granted cookieStoreId queries do not provide extension isolation. Hiding a toolbar icon is not enforcement. Patching extension identifiers, spoofing messages, editing security-critical code or weakening Gecko boundaries is intentionally excluded.

For company policy requiring actual separation, use distinct profiles with only approved accounts/extensions in each; a universal single-profile Space mod cannot honestly satisfy that boundary. A malicious privileged Sine script could bypass this manager altogether.

## 1Password, uBlock and developer tools

Default unmanaged. Sensitive detection is a conservative name/ID/API-permission warning heuristic, not a complete security classifier. Explicit per-rule opt-in remains necessary for detected products. Prefer leaving uBlock and other critical protections unmanaged/enabled rather than repeatedly interrupting filtering.

Company 1Password can be globally enabled only while the configured Space is active in a supported single-window setup, but is not isolated from other permitted tabs while on. No passwords, vault data, encrypted storage or native messages are read/altered. Disabling the extension does not guarantee that the desktop app is locked. Re-enabling may require unlocking or restoring integration.

Official 1Password per-item autofill choices can restrict suggestions to an exact host or suppress filling for a website; browser vault selection can reduce suggested items. These are usability controls, **not Space-specific security isolation**. Organizational vault/account access must be set through official administrator policy, never inferred from this mod. See primary links in RESEARCH.md.

Real 1Password/uBlock/React DevTools compatibility is not certified by synthetic fixture tests. Test a disposable profile and get organizational approval before assigning company/security extensions.

## Optional multi-window privacy guard (0.1.1)

This is the user’s explicit opt-in to profile-global disable operations while multiple/private/Little Zen browser windows exist. It overrides configured “Enabled everywhere” rules too; unmanaged extensions stay unchanged. Resume follows the single remaining window’s actual Space, not a stored ON flag. Native failures/interrupted guard recovery hold flags for explicit review. The default availability-preserving pause remains backward-compatible. There is still debounce/startup/lifecycle latency, no atomic cancellation, no undo of prior access, and no enforcement against a manual/policy conflict. This is not a new Firefox security boundary or guaranteed DLP control.
