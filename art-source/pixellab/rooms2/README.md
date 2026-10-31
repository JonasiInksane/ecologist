# rooms2: props regenerated to match rooms/concept-base.png

Made 2026-10-31 with the PixelLab MCP server, plus Pillow for cleanup. Everything here is git-excluded scratch work; no tracked files were touched.

## How it was made
- Tool: `create_image_pro` (Pro model, 25-64 candidates for each 10-generation call). The `style_image_url` was a crop of the matching prop from concept-base.png (see `refs/s-*.png`), and the style reference was accepted on every call. `style_copy` = outline, detail and shading. The colours came from `palette` = 99 colours from tools/palette.py (ramps ink, wood, copper, steel, concrete, chem, leaf, gold, red, blue, teal, grey, white, rock, soil, plaster, asphalt, room; the plants also used terracotta; the `glow` ramp was left out on purpose).
- Shared prompt suffix: "Pixel art game prop, single dark outline, neutral even shading lit from the top-left, no glow, no light effects, no background."
- One `create_object_pro_flash` test (tank, `style_image` = tank crop, view=side) also accepted the style reference; it is kept as raw/pf-tank-tall.png.
- The best candidate was hand-picked for each prop (raw/<name>-NN.png holds all candidates). Then `process` set alpha to 0/255, snapped every pixel to the palette with tools/palette.py snap(), fitted the prop to the target canvas (centred and bottom-aligned; the lamp is cropped from its rod), cut the glass and built the masks.
- Pipes: drawn procedurally in palette steel and copper so the 8x8 and 16x16 autotiles join exactly (see contact-pipes-tiled-demo.png). An AI 16x16 valve attempt (raw/valve16-*) came out unusable, so the procedural valves are used.
- concept-lit-liquids.png: create_image_pro 688x384, with concept-base.png as both the reference image and the style image.

## Vessels
- tank-tall and tank-wide: the glass interior is fully transparent, apart from a 1px glass edge highlight at alpha 70. The frame posts stay opaque. The -mask.png files are white over the whole interior (behind the posts too), so liquid drawn under the sprite shows through the glass and passes behind the posts.
- vat: the open cavity stays drawn dark. vat-mask.png is the opening (the liquid surface), meant for drawing liquid on top of the sprite.
- still: opaque copper. still-pot-mask.png marks the inside of the lower pot (for logic or an x-ray view).
- preview-liquid-test-4x.png shows test liquids drawn through the masks.

## Files
- props/barrel-stack.png 30x20
- props/barrel.png 14x20
- props/box.png 14x12
- props/chair.png 14x22
- props/crate-stack.png 32x28
- props/crate.png 16x16
- props/desk.png 48x32
- props/gauge.png 16x16
- props/generator.png 48x32
- props/grow-rack.png 44x48
- props/hydro-tray.png 44x16
- props/lamp.png 16x10
- props/plant-full.png 12x16
- props/plant-half.png 12x16
- props/plant-sprout.png 12x16
- props/pump.png 24x16
- props/shelf.png 40x48
- props/still-pot-mask.png 40x56
- props/still.png 40x56
- props/tank-tall-mask.png 32x56
- props/tank-tall.png 32x56
- props/tank-wide-mask.png 48x40
- props/tank-wide.png 48x40
- props/vat-mask.png 40x24
- props/vat.png 40x24
- props/workbench.png 48x44
- pipes/pipe-0000.png 8x8
- pipes/pipe-0001.png 8x8
- pipes/pipe-0010.png 8x8
- pipes/pipe-0011.png 8x8
- pipes/pipe-0100.png 8x8
- pipes/pipe-0101.png 8x8
- pipes/pipe-0110.png 8x8
- pipes/pipe-0111.png 8x8
- pipes/pipe-1000.png 8x8
- pipes/pipe-1001.png 8x8
- pipes/pipe-1010.png 8x8
- pipes/pipe-1011.png 8x8
- pipes/pipe-1100.png 8x8
- pipes/pipe-1101.png 8x8
- pipes/pipe-1110.png 8x8
- pipes/pipe-1111.png 8x8
- pipes/pipe-flange.png 8x8
- pipes/pipe-valve-closed.png 8x8
- pipes/pipe-valve-open.png 8x8
- pipes/pipe16-0000.png 16x16
- pipes/pipe16-0001.png 16x16
- pipes/pipe16-0010.png 16x16
- pipes/pipe16-0011.png 16x16
- pipes/pipe16-0100.png 16x16
- pipes/pipe16-0101.png 16x16
- pipes/pipe16-0110.png 16x16
- pipes/pipe16-0111.png 16x16
- pipes/pipe16-1000.png 16x16
- pipes/pipe16-1001.png 16x16
- pipes/pipe16-1010.png 16x16
- pipes/pipe16-1011.png 16x16
- pipes/pipe16-1100.png 16x16
- pipes/pipe16-1101.png 16x16
- pipes/pipe16-1110.png 16x16
- pipes/pipe16-1111.png 16x16
- pipes/pipe16-flange.png 16x16
- pipes/pipe16-valve-closed.png 16x16
- pipes/pipe16-valve-open.png 16x16
- concept-lit-liquids.png 688x384

## Picks (raw candidate -> prop)
- tank-tall: from raw/tank-tall-00.png -> 32x56 
- tank-wide: from raw/tank-wide-03.png -> 48x40 
- vat: from raw/vat-44.png -> 40x24 
- still: from raw/still-00.png -> 40x56 
- barrel: from raw/barrel-00.png -> 14x20 
- barrel-stack: from raw/barrels-10.png -> 30x20 
- crate: from raw/crate-09.png -> 16x16 
- crate-stack: from raw/crates-06.png -> 32x28 
- box: from raw/box-16.png -> 14x12 
- shelf: from raw/shelf-15.png -> 40x48 
- desk: from raw/desk-00.png -> 48x32 
- chair: from raw/chair-17.png -> 14x22 
- workbench: from raw/workbench-00.png -> 48x44 
- generator: from raw/generator-08.png -> 48x32 
- grow-rack: from raw/growrack-06.png -> 44x48 
- hydro-tray: from raw/tray-45.png -> 44x16 
- plant-sprout: from raw/plant-sprout-09.png -> 12x16 
- plant-half: from raw/plant-half-17.png -> 12x16 
- plant-full: from raw/plant-full-24.png -> 12x16 cropped 2px wide
- lamp: from raw/lamp-33.png -> 16x10 cropped 5px tall
- gauge: from raw/gauge-00.png -> 16x16 
- pump: from raw/pump2-09.png -> 24x16

## Generation count
270 generations in total (account went from 355.25 used to 625.25 used): 24 create_image_pro calls x 10 = 240, 1 create_image_pro concept = 25, 1 Pro Flash object = 5.
