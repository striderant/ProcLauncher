# Proc Launcher

A minimal, **Fabric-only** Minecraft launcher for Windows. Built with Electron + React + Vite. Features instance-based isolation, Mod browser, upgrade flow.
---

## Features

### Instances (Isolated Profiles)
- Each instance has its own `mods/`, `saves/`, `config/`, and settings
- Stored at `<userData>/minecraft/instances/<id>/instance.json`
- Per-instance: Minecraft version, Fabric loader, JVM args (overrides global Settings)
- Global Settings: RAM, resolution, default JVM args (used by all instances and versions)
- One-click run, switch, delete, upgrade

### Fabric-Only (No Forge/Quilt/NeoForge)
- Pinned Fabric loader per instance, auto-installed from `meta.fabricmc.net`
- Version inheritance resolution for custom profiles
- Java auto-detection per MC version (8/17/21)

### Mod Browser (Modrinth)
- Search with filters: loader (Fabric), MC version, sort (downloads/relevance/newest)
- Download directly to **global library** or **specific instance**
- Per-mod enable/disable (renames `.jar` ↔ `.jar.disabled`)
- Update checks against Modrinth API, one-click updates
- Downloaded mods picker: copy mods between instances without re-downloading

### Versions Tab (Vanilla Clients)
- Drop any client (CM Client, CheatBreaker, vanilla, custom profiles) into `.minecraft/versions/`
- Runs use **standard vanilla `.minecraft` folder** - configs, saves, mods shared globally
- Instances stay fully isolated in launcher's own folder

### Accounts
- **Offline accounts**: username + deterministic UUID + Minotar avatar
- **Microsoft accounts**: Device code flow, tokens encrypted in OS secure storage
- Account selector in navbar/sidebar

### UI
- Floating pill navbar (draggable, edge-snapping, top/bottom/left/right), centered homepage with processor icon
- Instances: Telegram-style list + detail panes

### Auto-Updates
- Checks GitHub Releases on startup and every 6h (packaged builds only)
- Stable channel follows full releases, beta channel also follows prereleases
- A circle appears top-right when an update is ready: click to download in the background, click again to restart and install

### Releasing a new version
1. Bump `version` in `package.json` (e.g. `0.2.0`)
2. Commit and push a tag: `git tag v0.2.0 && git push origin v0.2.0`
3. CI builds all OSes and publishes the GitHub Release (`latest.yml` included) — no manual uploads
4. Mark the release as **prerelease** on GitHub if it is beta-only

---

## Quick Start

### Prerequisites
- Node.js 20+
- Windows 10/11 (primary target; macOS/Linux untested)

### Development
```powershell
# Clone & install
git clone https://github.com/striderant/ProcLauncher.git
cd ProcLauncher
npm install

# Run dev (Vite + Electron with hot reload)
npm run start

# Run with DevTools open
npm run start:debug

# Run tests
npm test

# Production build (renderer only)
npm run build

# Portable Windows .exe
npm run build:exe

# Package without installer
npm run package
```

### Directory Structure (Runtime)
```
%APPDATA%/Proc Launcher/           # or ~/.config/Proc Launcher (Linux/macOS)
├── minecraft/
│   ├── instances/                 # Instance folders
│   │   └── <id>/
│   │       ├── instance.json      # Instance state
│   │       └── mods/              # Instance mods (enabled/disabled)
│   ├── mods/                      # Global downloaded-mods library
│   ├── versions/                  # Custom Fabric profiles
│   ├── libraries/                 # Shared Maven libraries
│   ├── assets/                    # Shared game assets
│   └── java/                      # Downloaded JDKs
├── launcher.log                   # Current session log
└── logs/                          # Daily log files (7-day retention)
```

---

## Architecture

### Frontend (`src/`)
| File | Responsibility |
|------|----------------|
| `App.jsx` | Shell: tabs, launch logic, account management, home deck |
| `hooks/useInstances.js` | **Single source of truth** for instance data (CRUD, mods, upgrades) |
| `components/InstanceDetail.jsx` | Instance edit panel, local mods list, **unsaved changes floating bar** |
| `components/TeleInstances.jsx` | Telegram-style list+detail instances UI |
| `components/InstanceUpgradeModal.jsx` | 3-step upgrade wizard (target → compat → review → execute) |
| `components/ModsTab.jsx` | Modrinth search, version modal, download to instance/global |
| `theme.js` | Design tokens (black/white + semantic green/red/yellow) |

### Electron Main (`electron/`)
| File | Responsibility |
|------|----------------|
| `main.js` | Window lifecycle, IPC handlers, app lifecycle, updater |
| `preload.js` | Context bridge: `window.electron.*` / `window.launcher.*` |
| `instances.js` | **Core instance logic**: create/update/delete, mod registration, upgrade classification, file copying |
| `versions.js` | Version manifest, Fabric install, inheritance merge |
| `launch.js` | Game process spawn, argument building, custom client support |
| `downloads.js` | Streaming download, JAR validation, ZIP extraction |
| `java.js` | Java version mapping (MC → Java 8/17/21), Adoptium downloads |
| `accounts/` | Offline + Microsoft auth (device code flow), encrypted token store |
| `logger.js` | File + console logging with daily rotation |
| `trayIcon.js` | Runtime-generated processor chip icon (PNG) |

### Data Flow
```
Renderer (React)          Main (Node/Electron)
     │                          │
     ├─ window.electron.* ───►  │  (IPC via preload bridge)
     │                          │
     │  webContents.send ───────►  (progress, logs, launch events)
```

---

## Configuration

### GitHub Auto-Updates
Edit `package.json`:
```json
{
  "repository": { "url": "https://github.com/striderant/ProcLauncher.git" },
  "build": {
    "publish": { "provider": "github", "owner": "striderant", "repo": "ProcLauncher", "releaseType": "release" }
  }
}
```

### Theme
All colors in `src/theme.js`:
```js
export const btnPrimary = '...'        // White button, black text
export const btnSecondary = '...'      // White border, white text
export const btnGhost = '...'          // Transparent, white text
export const fieldCls = '...'          // Input/select styling
export const badgeMono = '...'         // Monospace badge
```

### Preferences (stored in `prefs.json`)
```json
{
  "uiMode": "tele",           // legacy, ignored (Telegram UI is the only UI)
  "closeBehavior": "quit",    // "quit" | "tray"
  "updateChannel": "stable"   // "stable" | "beta"
}
```

---

## Testing

```bash
npm test                    # All tests (46 tests, 8 suites)
npm test -- test/upgrade-flow.test.js  # Single test file
```

**Test Stack**: Native `node:test` - no external runner.  
**Patterns**: Integration tests stub Electron + network (Modrinth API).

---

## Building

| Command | Output |
|---------|--------|
| `npm run build` | `dist/` (renderer production build) |
| `npm run build:exe` | Portable `.exe` in `release/` (electron-builder) |
| `npm run package` | Unpacked app in `release-build/` (electron-packager) |

**Icon**: Generated at runtime via `electron/trayIcon.js` (processor chip). No `.ico`/`icns` needed.

---

## Contributing

1. Fork & create feature branch
2. Follow existing code conventions:
   - No comments unless requested
   - No emojis in code
   - Functional React components + hooks
   - Tailwind utilities for styling
   - Semantic colors only (green/red/yellow for success/error/warning)
3. Run `npm test` and `npm run build` before PR
4. Update `AGENT.md` if architecture changes

---

## License

MIT - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Modrinth](https://modrinth.com/) - Mod API
- [Fabric](https://fabricmc.net/) - Loader & tooling
- [Prismarine Auth](https://github.com/PrismarineJS/prismarine-auth) - Microsoft auth
- [Lucide React](https://lucide.dev/) - Icons
- [Electron](https://www.electronjs.org/) - Desktop framework