# Game interface: a pixel-art HUD instead of tool bars

The first G1 playtest note was that the campaign looked like a website, not a game: full-width bars of flat buttons,
a status footer and side panels in a system font. This pass gives the campaign its own interface in the style of the
world. The sandbox keeps its tool bars, since it is a lab for the simulation.

## What the player sees

- **Top left:** health (heart), breath (bubble, only while it is short) and credits (coin), in a small steel plate.
- **Top right:** the game clock with a sun or a moon, the next delivery with a truck, and two buttons: the crate
  opens **stock and sales**, the gear opens the menu.
- **Bottom:** the **hotbar**. Two tabs on its left switch between building (hammer) and the kitchen kit (pot),
  as **K** does. Each slot shows the piece's picture, its key (1 to 0) and its price, or for a crated piece how
  many crates wait in the yard (×1). The selected slot is framed in amber, and the line above the hotbar names it.
- **Toasts** above the hotbar say what just happened ("Valve shut.", "Walk over to the truck first.") and fade after
  three seconds. They replace the footer.
- **The tooltip** at the pointer names what is under it: a piece of equipment with its contents and readings, the
  truck at the curb, a valve (open or shut) or a pump end.
- **Esc** closes an open window or the carried piece; with nothing open it opens the **menu** and pauses: back to
  work, save (F5), load (F9), stock and sales, day and night, the sandbox (Tab) and the controls.
- **Windows** are riveted steel frames: the kitchen window (with the piece's picture and the flame as a row of
  switches), and stock and sales (the campaign shows only the stock tab; the sandbox keeps the prototype lab,
  machines and underground tabs).
- **The laptop** opens a web page on its screen: **Bulkr**, "bulk goods to your curb · no questions, some answers".
  Suppliers are down the left, their goods are cards with a picture and a price in the middle, the quantity and the
  order button below them, and what is on the way and waiting in the yard on the right.

## Art and code

- Font: **Jersey 10** (SIL Open Font License, `godot/art/fonts/`), at 20 px for text and 30 px for titles, without
  antialiasing.
- `tools/make-ui-sprites.py` draws `godot/art/ui.png` (frames, buttons, slots, bars, paper and the laptop bezel, on a
  logical pixel grid saved at 2x) and `godot/art/icons.png` (35 icons, 16 x 16, drawn at 2x). They are placeholders
  in the style of the equipment sprites until hand-drawn art replaces them.
- `godot/ui_style.gd` (`UiStyle`) builds the Theme from those sheets: the 9-slice frames and buttons, and variations
  for hotbar slots, toasts, HUD text with a shadow, titles, muted text, notes, and the web page inside the laptop.
- `godot/hud.gd` builds the HUD, hotbar, toasts, tooltip and menu. `main.gd` owns the state and calls
  `hud.refresh`, `hud.toast`, `hud.set_tip` and `hud.highlight`; the hotbar slots are `kit_buttons` and
  `build_buttons`.
- The campaign windows sit under one themed control; any control under the pointer keeps clicks off the world.

## Tests

`tests/integration.gd` checks the HUD replacing the sandbox bars, the selected slot and slot counts, the toast, the
menu pausing and resuming, and the campaign stock window. `tests/ui_capture.gd` renders the HUD in the yard, the
kitchen window, the laptop shop and the menu.

## Next

Hand-drawn art for the frames and icons, a scale setting for large screens, controller navigation, and sounds for
clicks and toasts.
