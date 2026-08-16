# Platform support

Shittim-Server started life Windows-only. The server and the Control Center now
build and run on Linux (SteamOS/Steam Deck) and Apple-Silicon macOS as well, but
the platforms are not at parity yet. This is where each one actually stands.

The game client is a Windows x86-64 build on every platform — native on Windows,
under Proton on SteamOS, under CrossOver/Whisky on macOS — so the client patching
uses the same byte offsets everywhere and needs no per-platform reverse
engineering.

| Capability | Windows 10/11 | SteamOS (Steam Deck) | macOS (Apple Silicon) |
|---|---|---|---|
| Server + Control Center run | yes | yes | yes |
| First-run setup automation | full | partial | partial |
| .NET SDK install | automatic | automatic (`dotnet-install.sh` → `~/.dotnet`) | automatic (`~/.dotnet`) |
| mitmproxy install | automatic | automatic (standalone binary, per-user) | automatic (standalone binary) |
| CA certificate trust | automatic (one UAC prompt) | one `pkexec` prompt¹ | one admin prompt¹ |
| Hosts / offline mode | automatic (one UAC prompt) | one `pkexec` prompt¹ | one admin prompt¹ |
| Client auto-discovery | yes (Steam) | yes (Proton, incl. SD cards) | no — point at a CrossOver/Whisky install² |
| Online interception mode | yes | not supported³ | not supported³ |
| Client patching | yes | yes (Proton install) | yes (via the configured install) |

¹ The per-user installs (.NET, mitmproxy) run silently. The steps that touch the
system — trusting the CA and editing `/etc/hosts` — raise a single graphical
elevation prompt (`pkexec` on SteamOS, the macOS admin dialog). On SteamOS the
CA-trust step toggles the read-only rootfs around `update-ca-trust`; note that a
SteamOS system update can reset it, so it may need re-running after an update.

² macOS has no native Steam depot for the game. Set the game install directory in
Configuration (or `SHITTIM_CLIENT_INSTALL_DIR`) to your CrossOver/Whisky bottle's
`BlueArchive` folder.

³ mitmproxy's local-capture mode keys on a Windows process name and cannot match a
Proton-run client. Use **offline mode** (hosts + loopback) on SteamOS and macOS —
it needs no local capture.

## Building

`electron-builder` produces the Control Center per platform (Windows: portable +
NSIS, Linux: AppImage + deb, macOS arm64: dmg + zip). The .NET server publishes as
a self-contained runtime for `win-x64`, `linux-x64` and `osx-arm64`. Both release
workflows build each platform on its own runner. macOS builds are unsigned —
right-click → Open once to get past Gatekeeper.

## Still Windows-only, needs on-device validation

The Linux/macOS elevation, certificate-trust and hosts paths are implemented from
documented commands but have not yet been validated on real Steam Deck / Apple
Silicon hardware. If an automated step fails, the app falls back to showing the
exact command to run by hand.
