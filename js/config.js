// World size, tile size, and the ids of blocks and liquids.
const W = 512, H = 128, T = 8, PW = W * T, PH = H * T;
const VIEW_W = 1024, VIEW_H = 576;   // canvas size at 1x zoom
const CHUNK = 16;   // tiles per side of a sleep chunk
const AIR = 0, DIRT = 1, STONE = 2, OBSIDIAN = 3, COMB = 4, CRISP = 5, ICE = 6, CRYSTAL = 7, PUMP_IN = 8, PUMP_OUT = 9, BASALT = 10,
  LEVER = 11, PLATE = 12, SENSOR = 13, TIMER = 14, GATE = 15, SPRING = 16, DRAIN = 17, WOOD = 18, MOSS = 19, SALT = 20, SAND = 21,
  GLASS = 22, BRICK = 23, METAL = 24, PIPE = 25, VALVE = 26, FILTER = 27, TURBINE = 28, WHEEL = 29, BOILER = 30, SEPARATOR = 31,
  AND = 32, OR = 33, NOT = 34, COUNTER = 35, PLANT = 36, LEAF = 37, SNOW = 38,
  PERMAFROST = 39, CLAY = 40, WINDMILL = 41, GEYSER = 42, VENT = 43, SODA = 44, GEM = 45,
  SPONGE = 46, WETSPONGE = 47, WETDIRT = 48, POROUS = 49, WOOL = 50, COPPER = 51, MEMBRANE = 52, CORAL = 53, BLEACHED = 54, FUSE = 55, MAGNET = 56,
  BATTERY = 57, LAMP = 58, MOTOR = 59, EMAGNET = 60, SOLAR = 61, ORE = 62, SLAG = 63,
  THERMO = 64, DEPTH = 65, PIXEL = 66, SUGAR = 67,   // temperature sensor, depth (pressure) sensor, pixel display; sugar (a powder)
  RUST = 68, FNITRO = 69,   // rusted metal; frozen nitro
  LIMESTONE = 70, QUICKLIME = 71, LIME = 72, CHARCOAL = 73, ASH = 74, ALUMINIUM = 75, ZINC = 76, GOLD = 77, PATINA = 78,
  FLOWER = 79;   // a plant's flower, holding nectar   // LIME: slaked lime mortar; PATINA: copper gone green
const NBLOCK = 96;   // size of per-block tables (ids 80-95 are free)
const NONE = 0, WATER = 1, LAVA = 2, HONEY = 3, AETHER = 4, QUICK = 5, ACID = 6, FROST = 7, STEAM = 8, OIL = 9, SLIME = 10, BLOOM = 11, MUD = 12, TONIC = 13,
  FOAM = 14, STORM = 15, MOLTEN = 16, SMOKE = 17, METHANE = 18, POISON = 19, NITRO = 20, LYE = 21, CO2 = 22,
  VOID = 23, MIMIC = 24, COOLANT = 25, FERRO = 26, LIGHT = 27, FERT = 28, HYDROGEN = 29, OXYGEN = 30, MSLAG = 31,   // MSLAG: molten slag
  CHLORINE = 32, BLEACH = 33, EMULSION = 34;   // EMULSION: oil and water shaken (or soaped) together
const NLIQ = 40;   // reaction table stride; also the size of per-liquid tables
const AMBIENT = 20;   // resting temperature
// Dissolved contents: fractional concentration channels; concentrating a solution can exceed 255.
const SOL_SALT = 0, SOL_SUGAR = 1, SOL_ESSENCE = 2, SOL_RED = 3, SOL_YELLOW = 4, SOL_BLUE = 5, SOL_SILT = 6, SOL_ACID = 7, SOL_BASE = 8, SOL_FERT = 9, SOL_ALGAE = 10, SOL_METAL = 11, SOL_O2 = 12, SOL_SOAP = 13, SOL_OIL = 14, SOL_AMMONIA = 15, SOL_YEAST = 16, SOL_ETHANOL = 17, SOL_CO2 = 18, SOL_PHOSPHATE = 19, SOL_ACETATE = 20, NSOL = 21;
// O2: signed deficit from a fixed 9.1 mg/L reference, independent of temperature (js/oxygen.js);
// soap; oil: the oil share of an emulsion; ammonium from rot (fertiliser stands for nitrate); yeast;
// ethanol (alcohol); dissolved carbon dioxide
export { SOL_PHOSPHATE, SOL_ACETATE };

export { SOL_CO2, SOL_AMMONIA, SOL_YEAST, SOL_ETHANOL, FLOWER, EMULSION, SOL_O2, SOL_SOAP, SOL_OIL, LIMESTONE, QUICKLIME, LIME, CHARCOAL, ASH, ALUMINIUM, ZINC, GOLD, PATINA, CHLORINE, BLEACH, SOL_METAL, RUST, FNITRO, SUGAR, THERMO, DEPTH, PIXEL, ORE, SLAG, HYDROGEN, OXYGEN, MSLAG, BATTERY, LAMP, MOTOR, EMAGNET, SOLAR, SPONGE, WETSPONGE, WETDIRT, POROUS, WOOL, COPPER, MEMBRANE, CORAL, BLEACHED, FUSE, MAGNET, VOID, MIMIC, COOLANT, FERRO, LIGHT, FERT, SOL_FERT, SOL_ALGAE, SODA, GEM, LYE, CO2, SOL_ACID, SOL_BASE, W, H, T, PW, PH, VIEW_W, VIEW_H, CHUNK, AIR, DIRT, STONE, OBSIDIAN, COMB, CRISP, ICE, CRYSTAL, PUMP_IN, PUMP_OUT, BASALT, LEVER, PLATE, SENSOR, TIMER, GATE, SPRING, DRAIN, WOOD, MOSS, SALT, SAND, GLASS, BRICK, METAL, PIPE, VALVE, FILTER, TURBINE, WHEEL, BOILER, SEPARATOR, AND, OR, NOT, COUNTER, PLANT, LEAF, SNOW, PERMAFROST, CLAY, WINDMILL, GEYSER, VENT, NBLOCK, NONE, WATER, LAVA, HONEY, AETHER, QUICK, ACID, FROST, STEAM, OIL, SLIME, BLOOM, MUD, TONIC, FOAM, STORM, MOLTEN, SMOKE, METHANE, POISON, NITRO, NLIQ, AMBIENT, SOL_SALT, SOL_SUGAR, SOL_ESSENCE, SOL_RED, SOL_YELLOW, SOL_BLUE, SOL_SILT, NSOL };
