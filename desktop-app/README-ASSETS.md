# Desktop Refactor Asset Map

This directory is the planned static-asset layout for `desktop-app`.
Asset contents are copied byte-for-byte from the restored `desktop/` tree so the
UI can stay visually identical while imports and URL paths move to clearer
domains.

## Layout

| New directory | Purpose |
| --- | --- |
| `public/branding/` | App icons and public brand assets loaded by HTML, Tauri, or URL. |
| `public/runtime/` | Public runtime files loaded by fixed URL, such as workers and standalone HTML. |
| `public/artifact-gallery/` | Runtime artifact gallery JSON and preview images served from public URLs. |
| `assets/branding/` | Bundler-imported Claude/Anthropic brand marks. |
| `assets/message-activity/` | Assistant typing/thinking sprites, lottie files, and frame images. |
| `assets/fixtures/` | Static JSON data used by gallery pages, mocks, or fixture-style imports. |
| `assets/home/` | Chat landing composer, prompt suggestion, model selector, and plus-menu assets. |
| `assets/customization/` | Connector logos, directory controls, directory nav, plugin icons, and customization landing art. |
| `assets/navigation/` | App shell, sidebar, code/cowork mode, and capsule navigation icons. |
| `assets/profile-menu/` | Profile/account dropdown icons. |
| `assets/scheduled/` | Scheduled task page icons. |
| `assets/projects/` | Project page empty-state art. |

## Public Assets

| Old path | New path | Purpose |
| --- | --- | --- |
| `desktop/public/anthropic.svg` | `desktop-app/public/branding/anthropic-logo.svg` | Public Anthropic logo. |
| `desktop/public/favicon.ico` | `desktop-app/public/branding/app-icon.ico` | Tauri installer/window icon source. |
| `desktop/public/favicon.png` | `desktop-app/public/branding/app-icon.png` | Browser favicon and apple touch icon. |
| `desktop/public/icon-mac.png` | `desktop-app/public/branding/mac-app-icon.png` | macOS application icon image. |
| `desktop/public/code-recharge.html` | `desktop-app/public/runtime/code-recharge.html` | Standalone recharge page served as static HTML. |
| `desktop/public/pyodide-worker.js` | `desktop-app/public/runtime/pyodide-worker.js` | Pyodide worker loaded by runtime URL. |
| `desktop/public/artifacts/code/_index.json` | `desktop-app/public/artifact-gallery/code/manifest.json` | Public artifact code manifest; renamed from `_index` for clarity. |
| `desktop/public/artifacts/code/remixed-*.json` | `desktop-app/public/artifact-gallery/code/remixed-*.json` | Artifact code payloads fetched by gallery/runtime renderer. |
| `desktop/public/artifacts/previews/*` | `desktop-app/public/artifact-gallery/previews/*` | Public artifact preview images. Leaf filenames are preserved to match `img_src` values. |

## Artifact Gallery Fixtures

| Old path | New path | Purpose |
| --- | --- | --- |
| `desktop/src/data/inspirations.json` | `desktop-app/assets/fixtures/artifact-gallery/inspirations.json` | Inspiration/gallery item catalog. |

Artifact code payloads and preview images are retained only under
`public/artifact-gallery/` because current components fetch them by runtime URL.
The duplicate importable copies were removed after static reference checks found
no live imports.

## Bundler Asset Mapping

| Old path | New path | Purpose |
| --- | --- | --- |
| `desktop/public/anthropic.svg` | `desktop-app/assets/branding/anthropic-logo.svg` | Importable Anthropic logo. |
| `desktop/src/assets/icons/claude.png` | `desktop-app/assets/branding/claude-mark.png` | Claude mark used in navigation/sidebar UI. |
| `desktop/src/assets/icons/claude_logo.png` | `desktop-app/assets/branding/claude-logo.png` | Claude logo image. |
| `desktop/src/assets/message-activity/claude-thinking-sprite.svg` | `desktop-app/assets/message-activity/thinking-sprite.svg` | Assistant thinking sprite. |
| `desktop/src/assets/message-activity/claude-thinking-sprite.css` | `desktop-app/assets/message-activity/thinking-sprite.css` | Sprite CSS reference. |
| `desktop/src/assets/message-activity/claude-thinking-sprite.html` | `desktop-app/assets/message-activity/thinking-sprite.html` | Sprite source/reference HTML. |
| `desktop/src/assets/message-activity/lottie/thinking.lottie` | `desktop-app/assets/message-activity/lottie/thinking-indicator.lottie` | Thinking animation. |
| `desktop/src/assets/message-activity/lottie/typing.lottie` | `desktop-app/assets/message-activity/lottie/typing-indicator.lottie` | Typing animation. |
| `desktop/src/assets/message-activity/typing-frames/images/1.webp` - `12.webp` | `desktop-app/assets/message-activity/typing-frames/typing-frame-01.webp` - `typing-frame-12.webp` | Numbered typing animation frames with stable zero-padded names. |
| `desktop/src/assets/home/input-plus.svg` | `desktop-app/assets/home/composer/input-plus.svg` | Composer add button. |
| `desktop/src/assets/home/voice-mode.svg` | `desktop-app/assets/home/composer/voice-mode.svg` | Composer voice-mode control. |
| `desktop/src/assets/home/hero-star.svg` | `desktop-app/assets/home/composer/hero-star.svg` | Home hero decorative icon. |
| `desktop/src/assets/home/gift-giving.lottie` | `desktop-app/assets/home/composer/gift-giving.lottie` | Home animation asset. |
| `desktop/src/assets/home/model-caret.svg` | `desktop-app/assets/home/model-selector/caret.svg` | Model selector caret. |
| `desktop/src/assets/home/prompt-*.svg` | `desktop-app/assets/home/prompt-suggestions/{write,learn,code,life,choice}.svg` | Prompt suggestion category icons. |
| `desktop/src/assets/home/plus-menu/*` | `desktop-app/assets/home/plus-menu/*` | Plus-menu actions. Filenames are already descriptive and preserved. |
| `desktop/src/assets/customize/connectors/*.svg` | `desktop-app/assets/customization/connector-logos/*-logo.svg` | Connector/provider logos. |
| `desktop/src/assets/customize/directory/{close,download,search,chevron-down}.svg` | `desktop-app/assets/customization/directory-controls/{close,download,search,chevron-down}.svg` | Customize directory modal controls. |
| `desktop/src/assets/customize/directory/nav-*.svg` | `desktop-app/assets/customization/directory-nav/{connectors,plugins,skills}.svg` | Customize directory nav icons. |
| `desktop/src/assets/customize/directory/plugin-*.svg` | `desktop-app/assets/customization/plugin-icons/*.svg` | Plugin/category icons with redundant `plugin-` prefix removed. |
| `desktop/src/assets/icons/{skills,connectors,customize-main,create-skills,connect-tools,customize-icon}.png` | `desktop-app/assets/customization/landing/*.png` | Customization landing page artwork and icons. |
| `desktop/src/assets/icons/{sidebar-toggle,new_chat,code,search-icon,artifacts,chats,projects,web-search}.png` | `desktop-app/assets/navigation/app-shell/*` | General app-shell navigation icons. Names normalized to kebab-case where needed. |
| `desktop/src/assets/sidebar-custom/code-*.svg` | `desktop-app/assets/navigation/sidebar/code/*.svg` | Code-mode sidebar icons with mode prefix removed. |
| `desktop/src/assets/sidebar-custom/cowork-*.svg` | `desktop-app/assets/navigation/sidebar/cowork/*.svg` | Cowork-mode sidebar icons with mode prefix removed. |
| `desktop/src/assets/sidebar-custom/recent-conversation-ring.svg` | `desktop-app/assets/navigation/sidebar/shared/recent-conversation-ring.svg` | Shared recent-conversation marker. |
| `desktop/src/assets/figma-exports/sidebar-icons/*.svg` | `desktop-app/assets/navigation/sidebar/classic/*.svg` | Sidebar icons used directly by current components. |
| `desktop/src/assets/sidebar-exact/*.svg` | `desktop-app/assets/navigation/sidebar/classic/*-exact.svg` | Exact sidebar icon variants. |
| `desktop/src/assets/cowork-capsule-icons/*.svg` | `desktop-app/assets/navigation/cowork-capsules/*.svg` | Cowork capsule feature icons. |
| `desktop/src/assets/profile-menu/*.svg` | `desktop-app/assets/profile-menu/*.svg` | Profile/account menu icons. |
| `desktop/src/assets/figma-exports/scheduled-page/*-icon.svg` | `desktop-app/assets/scheduled/*.svg` | Scheduled page controls and empty-state icons. |
| `desktop/src/assets/figma-exports/scheduled-page/keep-awake-toggle.svg` | `desktop-app/assets/scheduled/keep-awake-toggle.svg` | Scheduled page keep-awake toggle art. |
| `desktop/src/assets/icons/start-projects.png` | `desktop-app/assets/projects/start-projects.png` | Projects page empty-state/start art. |

## Not Migrated

The following restored assets were not copied because no current runtime import,
dynamic URL load, or data reference was found during the static scan:

| Old path | Reason |
| --- | --- |
| `desktop/src/assets/figma-exports/asset-*.png` | Raw Figma dump filenames with no current code references. |
| `desktop/src/assets/figma-exports/vectorized*.svg` | Raw/vectorized Figma exports with no current code references. |
| `desktop/src/assets/figma-exports/svg-converted/asset-*.svg` | Converted Figma dump assets with no current code references. |
| `desktop/src/assets/figma-exports/cowork-icons/*` | Legacy duplicate cowork icon exports; clearer sidebar/capsule variants were migrated. |

If future refactor work discovers a live reference to one of these files, copy it
into the matching domain directory rather than reintroducing `figma-exports/`.
