# RetroAchievements OBS Tracker Studio v1.0.2

A local Windows application for configuring one transparent OBS Browser Source with either **Latest unlocked** or **Next to unlock** achievement tracking.

## Start

1. Extract the ZIP.
2. Run `Start Overlay.bat` from the `ra_obs_tracker` folder.
3. Enter your RetroAchievements username and Web API key.
4. Choose the display mode, game or subset, and how many achievements to show.
5. Set the Browser Source dimensions under Preview and adjust Aesthetics.
6. Click **Save & test connection**.

Your API key is stored locally in `config.json`. Keep your existing `config.json` when updating an installation; it is not included in the ZIP.

## Achievement count

Both display modes support **1–5 achievements** independently:

- **Latest unlocked:** the most recently earned achievements for the selected Hardcore/Softcore mode.
- **Next to unlock:** the first locked achievements in RetroAchievements display order.

The default remains 3 for each mode. The overlay supports up to five achievement rows. Each badge remains 64 × 64 px. When showing four or five entries, increase Preview Height as needed; the Display panel shows a reminder if the selected height is likely too short. The default Browser Source size is 480 × 430 px.

## Game / subset

Automatic mode follows the most recently reported main game. Subset play may not be detected automatically. To track a subset, select **Achievement subset** and enter the parent game ID plus subset ID, or paste the full subset URL (for example `https://retroachievements.org/game/2664?set=7940`).

## Aesthetics

The Aesthetics panel includes independent visibility checkboxes for the game icon, game title, console, progress, achievement section heading, achievement icons, achievement titles, points, descriptions, and empty-state message. These toggles update the live preview and the OBS overlay. Icon visibility is separate from icon-border visibility.

The panel also allows a global font choice and independent sizes and colors for the game title, console, progress, section heading, achievement title, points, and description. It also includes independent visibility and color controls for the 2 px game-icon and achievement-icon borders. **Reset defaults** restores the default font, sizes, colors and border settings.

Achievement titles are limited to one line and use an ellipsis when too long. Achievement descriptions are limited to two complete lines and use an ellipsis when more text remains. The browser overlay uses a separate clipping wrapper to prevent partial third-line rendering. The description line height and padding protect descenders (such as y and g).

## Preview and OBS

The Studio preview uses the selected Width and Height as the overlay's actual viewport dimensions, then scales the preview proportionally to fit the panel. It is demonstrative only; it does not resize an OBS source.

1. In OBS, go to **Sources → + → Browser**.
2. Paste `http://127.0.0.1:8765/` into the Browser source's **URL** field.
3. Open the Browser source **Properties** and enter the same Width and Height selected under the Studio Preview.
4. Click OK and keep Tracker Studio running while OBS uses the overlay.

## Fonts

Available fonts: Arial, Impact, Verdana, Tahoma, Trebuchet MS, Georgia, Courier New, and Segoe UI. Font availability depends on the Windows system running OBS.

## Subset achievement badge images

Subset achievement icons always use the colored/unlocked badge artwork. The server prefers the API's `badgeUrl`; if only a `badgeLockedUrl` is available, it removes the `_lock` suffix before the image URL is sent to the overlay. The browser overlay applies the same normalization as a safeguard. For example, `744502_lock.png` becomes `744502.png`.

## Configuration notes

New installations use these defaults: 3 achievements for each display mode, 480 × 430 px preview, Arial font, and the current standard typography settings. Existing saved counts and dimensions are preserved during an update.


## v1.0.2 interface update

Element visibility checkboxes are integrated into each corresponding Aesthetics card, beside its size/color controls. Game icon and achievement icon visibility toggles are placed inside their existing icon-border cards. Empty-state visibility remains in its own compact card.
