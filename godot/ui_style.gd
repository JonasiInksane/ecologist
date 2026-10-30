class_name UiStyle
extends RefCounted
## The game's interface look: the Jersey 10 pixel font and the steel frames, buttons, hotbar slots and bars drawn by
## tools/make-ui-sprites.py, built into one Theme. Regions are in art/ui.png pixels (drawn at 2x); icons are 16 x 16
## in art/icons.png, in the order the sprite script lists them.

const FONT := "res://art/fonts/Jersey10-Regular.ttf"
const SHEET := "res://art/ui.png"
const ICON_SHEET := "res://art/icons.png"
const ICONS := ["heart", "bubble", "coin", "sun", "moon", "truck", "crate", "gear", "pause", "hammer", "pot",
    "wood", "brick", "stone", "glass", "steel", "dirt", "wood_wall", "brick_wall", "ladder", "door",
    "pipe", "valve", "pump", "thermometer", "drop", "flask", "flame", "laptop", "save", "load", "sandbox",
    "sack", "beet", "close", "person", "roof", "plaster_wall"]
const TEXT := Color("f0e9d2")
const MUTED := Color("a9b8ba")
const ACCENT := Color("f2c94c")
const GOOD := Color("9fe6b0")
const BAD := Color("ee7a6a")
const INK := Color("282c30")
const SIZE := 20
const TITLE_SIZE := 30

static var _theme: Theme
static var _textures := {}
static var _font: FontFile

# Imported when the editor has seen the file; read straight from disk otherwise (headless test runs).
static func texture(path: String) -> Texture2D:
    if not _textures.has(path):
        if ResourceLoader.exists(path):
            _textures[path] = load(path)
        else:
            var image := Image.load_from_file(ProjectSettings.globalize_path(path))
            _textures[path] = ImageTexture.create_from_image(image) if image != null else null
    return _textures[path]

static func font() -> FontFile:
    if _font == null:
        _font = load(FONT) if ResourceLoader.exists(FONT) else FontFile.new()
        if not ResourceLoader.exists(FONT):
            _font.load_dynamic_font(ProjectSettings.globalize_path(FONT))
        _font.antialiasing = TextServer.FONT_ANTIALIASING_NONE
        _font.hinting = TextServer.HINTING_NONE
        _font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
    return _font

static func icon(name: String) -> Texture2D:
    var index := ICONS.find(name)
    var atlas := AtlasTexture.new()
    atlas.atlas = texture(ICON_SHEET)
    atlas.region = Rect2((index % 16) * 16, (index / 16) * 16, 16, 16) if index >= 0 else Rect2(0, 0, 0, 0)
    return atlas

# A piece of equipment's sprite, for the kit hotbar.
static func sprite(sheet: String, region: Array) -> Texture2D:
    var atlas := AtlasTexture.new()
    atlas.atlas = texture(sheet)
    atlas.region = Rect2(region[0], region[1], region[2], region[3])
    return atlas

static func box(x: int, y: int, w: int, h: int, margin: int, content := Vector4(-1, -1, -1, -1)) -> StyleBoxTexture:
    var style := StyleBoxTexture.new()
    style.texture = texture(SHEET)
    style.region_rect = Rect2(x, y, w, h)
    style.set_texture_margin_all(margin)
    if content.x >= 0:
        style.content_margin_left = content.x
        style.content_margin_top = content.y
        style.content_margin_right = content.z
        style.content_margin_bottom = content.w
    return style

static func frame() -> StyleBoxTexture:
    return box(0, 0, 64, 64, 12, Vector4(18, 16, 18, 16))

static func toast() -> StyleBoxTexture:
    return box(0, 64, 32, 32, 6, Vector4(12, 6, 12, 8))

static func slot(selected: bool) -> StyleBoxTexture:
    return box(192, 40 if selected else 0, 40, 40, 8, Vector4(4, 4, 4, 4))

static func bar(color: String) -> StyleBoxTexture:
    var x: int = {"red": 56, "blue": 72, "green": 88, "amber": 104}[color]
    return box(x, 64, 16, 16, 3)

static func theme() -> Theme:
    if _theme != null:
        return _theme
    var t := Theme.new()
    t.default_font = font()
    t.default_font_size = SIZE
    t.set_color("font_color", "Label", TEXT)
    t.set_stylebox("panel", "PanelContainer", frame())
    t.set_stylebox("panel", "Panel", frame())
    var normal := box(64, 0, 32, 32, 6, Vector4(12, 4, 12, 7))
    var hover := box(96, 0, 32, 32, 6, Vector4(12, 4, 12, 7))
    var pressed := box(128, 0, 32, 32, 6, Vector4(12, 6, 12, 5))
    var disabled := box(160, 0, 32, 32, 6, Vector4(12, 4, 12, 7))
    for type in ["Button", "OptionButton", "MenuButton"]:
        t.set_stylebox("normal", type, normal)
        t.set_stylebox("hover", type, hover)
        t.set_stylebox("pressed", type, pressed)
        t.set_stylebox("hover_pressed", type, pressed)
        t.set_stylebox("disabled", type, disabled)
        t.set_stylebox("focus", type, StyleBoxEmpty.new())
        t.set_color("font_color", type, TEXT)
        t.set_color("font_hover_color", type, Color.WHITE)
        t.set_color("font_pressed_color", type, ACCENT)
        t.set_color("font_hover_pressed_color", type, ACCENT)
        t.set_color("font_disabled_color", type, MUTED.darkened(0.3))
    var field := box(32, 64, 24, 24, 5, Vector4(8, 3, 8, 4))
    t.set_stylebox("normal", "LineEdit", field)
    t.set_stylebox("focus", "LineEdit", StyleBoxEmpty.new())
    t.set_stylebox("read_only", "LineEdit", field)
    t.set_color("font_color", "LineEdit", TEXT)
    t.set_color("caret_color", "LineEdit", ACCENT)
    t.set_stylebox("panel", "PopupMenu", toast())
    t.set_stylebox("hover", "PopupMenu", hover)
    t.set_color("font_color", "PopupMenu", TEXT)
    t.set_color("font_hover_color", "PopupMenu", Color.WHITE)
    t.set_stylebox("panel", "TooltipPanel", toast())
    t.set_color("font_color", "TooltipLabel", TEXT)
    t.set_stylebox("background", "ProgressBar", box(32, 64, 24, 24, 4))
    t.set_stylebox("fill", "ProgressBar", bar("red"))
    t.set_color("font_color", "ProgressBar", Color(0, 0, 0, 0))
    var line := StyleBoxLine.new()
    line.color = Color("5d6d76")
    line.thickness = 2
    t.set_stylebox("separator", "HSeparator", line)
    t.set_stylebox("panel", "TabContainer", StyleBoxEmpty.new())
    t.set_stylebox("tab_selected", "TabContainer", pressed)
    t.set_stylebox("tab_unselected", "TabContainer", normal)
    t.set_stylebox("tab_hovered", "TabContainer", hover)
    t.set_color("font_selected_color", "TabContainer", ACCENT)
    t.set_color("font_unselected_color", "TabContainer", TEXT)
    # Variations: hotbar slots, small toasts, HUD text with a drop shadow, titles, and the laptop's web page.
    t.set_type_variation("Slot", "Button")
    t.set_stylebox("normal", "Slot", slot(false))
    t.set_stylebox("hover", "Slot", slot(false))
    t.set_stylebox("pressed", "Slot", slot(true))
    t.set_stylebox("hover_pressed", "Slot", slot(true))
    t.set_stylebox("disabled", "Slot", slot(false))
    t.set_stylebox("focus", "Slot", StyleBoxEmpty.new())
    t.set_type_variation("SlotSelected", "Slot")
    t.set_stylebox("normal", "SlotSelected", slot(true))
    t.set_stylebox("hover", "SlotSelected", slot(true))
    t.set_type_variation("Toast", "PanelContainer")
    t.set_stylebox("panel", "Toast", toast())
    t.set_type_variation("HudLabel", "Label")
    t.set_color("font_shadow_color", "HudLabel", Color(0, 0, 0, 0.75))
    t.set_constant("shadow_offset_x", "HudLabel", 2)
    t.set_constant("shadow_offset_y", "HudLabel", 2)
    t.set_type_variation("Title", "Label")
    t.set_font_size("font_size", "Title", TITLE_SIZE)
    t.set_color("font_color", "Title", ACCENT)
    t.set_type_variation("Muted", "Label")
    t.set_color("font_color", "Muted", MUTED)
    t.set_type_variation("Note", "Label")
    t.set_color("font_color", "Note", ACCENT)
    t.set_type_variation("Bezel", "PanelContainer")
    t.set_stylebox("panel", "Bezel", box(168, 64, 64, 64, 18, Vector4(22, 22, 22, 26)))
    t.set_type_variation("WebPanel", "PanelContainer")
    t.set_stylebox("panel", "WebPanel", box(120, 64, 24, 24, 4, Vector4(12, 10, 12, 10)))
    t.set_type_variation("WebCard", "PanelContainer")
    t.set_stylebox("panel", "WebCard", box(120, 64, 24, 24, 4, Vector4(10, 8, 10, 8)))
    t.set_type_variation("WebCardSelected", "PanelContainer")
    t.set_stylebox("panel", "WebCardSelected", box(144, 64, 24, 24, 4, Vector4(10, 8, 10, 8)))
    t.set_type_variation("WebLabel", "Label")
    t.set_color("font_color", "WebLabel", INK)
    t.set_type_variation("WebMuted", "Label")
    t.set_color("font_color", "WebMuted", Color("6b6f72"))
    t.set_type_variation("WebTitle", "Label")
    t.set_color("font_color", "WebTitle", Color("b0522a"))
    t.set_font_size("font_size", "WebTitle", TITLE_SIZE)
    t.set_type_variation("WebButton", "Button")
    t.set_stylebox("normal", "WebButton", box(64, 32, 32, 32, 6, Vector4(12, 4, 12, 7)))
    t.set_stylebox("hover", "WebButton", box(96, 32, 32, 32, 6, Vector4(12, 4, 12, 7)))
    t.set_stylebox("pressed", "WebButton", box(128, 32, 32, 32, 6, Vector4(12, 6, 12, 5)))
    t.set_stylebox("hover_pressed", "WebButton", box(128, 32, 32, 32, 6, Vector4(12, 6, 12, 5)))
    t.set_color("font_color", "WebButton", INK)
    t.set_color("font_hover_color", "WebButton", INK)
    t.set_color("font_pressed_color", "WebButton", INK)
    t.set_color("font_hover_pressed_color", "WebButton", INK)
    t.set_color("font_disabled_color", "WebButton", Color("8d9094"))
    t.set_stylebox("disabled", "WebButton", box(64, 32, 32, 32, 6, Vector4(12, 4, 12, 7)))
    t.set_stylebox("focus", "WebButton", StyleBoxEmpty.new())
    # A product card on the web page: paper, amber when picked.
    t.set_type_variation("WebItem", "Button")
    for state in ["normal", "hover", "disabled"]:
        t.set_stylebox(state, "WebItem", box(120, 64, 24, 24, 4))
    for state in ["pressed", "hover_pressed"]:
        t.set_stylebox(state, "WebItem", box(144, 64, 24, 24, 4))
    t.set_stylebox("focus", "WebItem", StyleBoxEmpty.new())
    _theme = t
    return t

static func label(text: String, variation := "", size := 0) -> Label:
    var result := Label.new()
    result.text = text
    result.theme_type_variation = variation
    if size > 0:
        result.add_theme_font_size_override("font_size", size)
    return result

static func icon_rect(texture: Texture2D, size := 32) -> TextureRect:
    var rect := TextureRect.new()
    rect.texture = texture
    rect.custom_minimum_size = Vector2(size, size)
    rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
    rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
    return rect
