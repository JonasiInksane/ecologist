// Generated from the browser reference. Do not edit.
#pragma once
#include "materials.hpp"
namespace ecologist {
inline constexpr int B_AIR=0;
inline constexpr int B_DIRT=1;
inline constexpr int B_STONE=2;
inline constexpr int B_OBSIDIAN=3;
inline constexpr int B_COMB=4;
inline constexpr int B_CRISP=5;
inline constexpr int B_ICE=6;
inline constexpr int B_CRYSTAL=7;
inline constexpr int B_PUMP_IN=8;
inline constexpr int B_PUMP_OUT=9;
inline constexpr int B_BASALT=10;
inline constexpr int B_LEVER=11;
inline constexpr int B_PLATE=12;
inline constexpr int B_SENSOR=13;
inline constexpr int B_TIMER=14;
inline constexpr int B_GATE=15;
inline constexpr int B_SPRING=16;
inline constexpr int B_DRAIN=17;
inline constexpr int B_WOOD=18;
inline constexpr int B_MOSS=19;
inline constexpr int B_SALT=20;
inline constexpr int B_SAND=21;
inline constexpr int B_GLASS=22;
inline constexpr int B_BRICK=23;
inline constexpr int B_METAL=24;
inline constexpr int B_PIPE=25;
inline constexpr int B_VALVE=26;
inline constexpr int B_FILTER=27;
inline constexpr int B_TURBINE=28;
inline constexpr int B_WHEEL=29;
inline constexpr int B_BOILER=30;
inline constexpr int B_SEPARATOR=31;
inline constexpr int B_AND=32;
inline constexpr int B_OR=33;
inline constexpr int B_NOT=34;
inline constexpr int B_COUNTER=35;
inline constexpr int B_PLANT=36;
inline constexpr int B_LEAF=37;
inline constexpr int B_SNOW=38;
inline constexpr int B_PERMAFROST=39;
inline constexpr int B_CLAY=40;
inline constexpr int B_WINDMILL=41;
inline constexpr int B_GEYSER=42;
inline constexpr int B_VENT=43;
inline constexpr int B_SODA=44;
inline constexpr int B_GEM=45;
inline constexpr int B_SPONGE=46;
inline constexpr int B_WETSPONGE=47;
inline constexpr int B_WETDIRT=48;
inline constexpr int B_POROUS=49;
inline constexpr int B_WOOL=50;
inline constexpr int B_COPPER=51;
inline constexpr int B_MEMBRANE=52;
inline constexpr int B_CORAL=53;
inline constexpr int B_BLEACHED=54;
inline constexpr int B_FUSE=55;
inline constexpr int B_MAGNET=56;
inline constexpr int B_BATTERY=57;
inline constexpr int B_LAMP=58;
inline constexpr int B_MOTOR=59;
inline constexpr int B_EMAGNET=60;
inline constexpr int B_SOLAR=61;
inline constexpr int B_ORE=62;
inline constexpr int B_SLAG=63;
inline constexpr int B_THERMO=64;
inline constexpr int B_DEPTH=65;
inline constexpr int B_PIXEL=66;
inline constexpr int B_SUGAR=67;
inline constexpr int B_RUST=68;
inline constexpr int B_FNITRO=69;
inline constexpr int B_LIMESTONE=70;
inline constexpr int B_QUICKLIME=71;
inline constexpr int B_LIME=72;
inline constexpr int B_CHARCOAL=73;
inline constexpr int B_ASH=74;
inline constexpr int B_ALUMINIUM=75;
inline constexpr int B_ZINC=76;
inline constexpr int B_GOLD=77;
inline constexpr int B_PATINA=78;
inline constexpr int B_FLOWER=79;
inline constexpr int L_NONE=0;
inline constexpr int L_WATER=1;
inline constexpr int L_LAVA=2;
inline constexpr int L_HONEY=3;
inline constexpr int L_AETHER=4;
inline constexpr int L_QUICK=5;
inline constexpr int L_ACID=6;
inline constexpr int L_FROST=7;
inline constexpr int L_STEAM=8;
inline constexpr int L_OIL=9;
inline constexpr int L_SLIME=10;
inline constexpr int L_BLOOM=11;
inline constexpr int L_MUD=12;
inline constexpr int L_TONIC=13;
inline constexpr int L_FOAM=14;
inline constexpr int L_STORM=15;
inline constexpr int L_MOLTEN=16;
inline constexpr int L_SMOKE=17;
inline constexpr int L_METHANE=18;
inline constexpr int L_POISON=19;
inline constexpr int L_NITRO=20;
inline constexpr int L_LYE=21;
inline constexpr int L_CO2=22;
inline constexpr int L_VOID=23;
inline constexpr int L_MIMIC=24;
inline constexpr int L_COOLANT=25;
inline constexpr int L_FERRO=26;
inline constexpr int L_LIGHT=27;
inline constexpr int L_FERT=28;
inline constexpr int L_HYDROGEN=29;
inline constexpr int L_OXYGEN=30;
inline constexpr int L_MSLAG=31;
inline constexpr int L_CHLORINE=32;
inline constexpr int L_BLEACH=33;
inline constexpr int L_EMULSION=34;
inline constexpr int BLOCK_COUNT=96;
inline constexpr double INK_COLORS[8][3]={{255,255,255},{230,30,40},{250,215,40},{235,120,20},{40,95,200},{130,40,150},{40,160,70},{50,30,20}};
inline constexpr double SOLUTE_TINTS[][5]={{0,215,240,235,0.25},{1,235,170,60,0.45},{2,235,130,205,0.5},{6,130,92,55,0.7},{7,170,240,140,0.3},{8,190,200,255,0.3},{9,150,130,80,0.3},{10,50,140,40,0.85},{11,200,175,90,0.35},{16,235,225,190,0.35}};
inline constexpr double BLOCK_CAP[]={0,1.399999976158142,2.132999897003174,1.9199999570846558,2.5,1.875,1.9165300130844116,1.881500005722046,1.7999999523162842,1.7999999523162842,2.4779999256134033,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.0800000429153442,1.5,1.031999945640564,1.2799999713897705,2.125,1.7100000381469727,3.8464999198913574,3.8464999198913574,3.8464999198913574,3.8464999198913574,1.7999999523162842,1.7999999523162842,3.8464999198913574,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,2.0999999046325684,1.5,0.6269999742507935,2.1600000858306885,1.7480000257492065,1.7999999523162842,2.132999897003174,2.132999897003174,1.0399999618530273,1.8661999702453613,0.06499999761581421,3.9000000953674316,3.0399999618530273,1.274999976158142,0.25200000405311584,3.4944000244140625,1.7999999523162842,1.7000000476837158,1.7000000476837158,1.5,3.5,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,1.7999999523162842,3.5174999237060547,2.319999933242798,3.4944000244140625,1.7999999523162842,1.7999999523162842,1.0625,1.75,2.249000072479248,2.365999937057495,1.125,2.0399999618530273,0.4000000059604645,0.5879999995231628,2.430000066757202,2.784600019454956,2.509000062942505,3.4709999561309814,1.2000000476837158,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174,2.132999897003174};
inline constexpr double BLOCK_COND[]={0,0.7745966911315918,1.6733200550079346,1.095445156097412,0.547722578048706,0.4472135901451111,1.4764822721481323,2.4494898319244385,3.872983455657959,3.872983455657959,1.3038405179977417,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,0.3872983455657959,0.6324555277824402,0.7745966911315918,0.5,1,0.8944271802902222,7.071067810058594,7.071067810058594,7.071067810058594,7.071067810058594,3.872983455657959,3.872983455657959,7.071067810058594,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,0.6324555277824402,0.547722578048706,0.3872983455657959,1.4142135381698608,1.095445156097412,3.872983455657959,1.6733200550079346,1.6733200550079346,0.547722578048706,2.5495097637176514,0.22360679507255554,0.7071067690849304,1.1832159757614136,0.7071067690849304,0.20000000298023224,20.02498435974121,0.4472135901451111,1.2247449159622192,1.2247449159622192,0.4472135901451111,3.1622776985168457,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,3.872983455657959,3.316624879837036,1,20.02498435974121,3.872983455657959,3.872983455657959,0.3872983455657959,0.7745966911315918,0.547722578048706,1.140175461769104,0.547722578048706,0.8944271802902222,0.2828427255153656,0.3162277638912201,15.36229133605957,11.045360565185547,17.83255386352539,17.32050895690918,0.547722578048706,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346,1.6733200550079346};
inline constexpr double LIQ_COND[]={0,2.3237900733947754,1.2247449159622192,0.7071067690849304,2.1213202476501465,8.642915725708008,1.6431676149368286,2.1213202476501465,0.21661601960659027,1.1618950366973877,0.7071067690849304,2.3237900733947754,1.095445156097412,2.3237900733947754,0.3162277638912201,2.3237900733947754,17.748239517211914,0.23729096353054047,0.2526155114173889,0.13699999451637268,1.341640830039978,2.3237900733947754,0.17329281568527222,2.3237900733947754,2.3237900733947754,7.348469257354736,1.341640830039978,2.1213202476501465,2.1213202476501465,0.58124178647995,0.2209058552980423,1,0.12996961176395416,2.3237900733947754,1.8973666429519653,2.3237900733947754,2.3237900733947754,2.3237900733947754,2.3237900733947754,2.3237900733947754};
inline constexpr double AIR_CONDUCTANCE=0.22090586230338027, HEAT_RATE=0.0225;
inline constexpr int ELECTROLYSIS_AMOUNT=8, ELECTROLYSIS_TRIES=2;
inline constexpr double CFG_PUMP_RATE=48;
inline constexpr double CFG_PIPE_RATE=96;
inline constexpr double CFG_MIN_DROP=32;
inline constexpr double CFG_MAX_SOURCES=4;
inline constexpr double CFG_SPRING_RATE=40;
inline constexpr double CFG_DRAIN_RATE=64;
inline constexpr double CFG_BOILER_TEMP=200;
inline constexpr double CFG_BOILER_HEAT=0.04;
inline constexpr double CFG_SEPARATE_RATE=24;
inline constexpr double CFG_SEPARATE_LIMIT=400;
inline constexpr double CFG_MOTOR_RATE=24;
inline constexpr double CFG_MEMBRANE_RATE=32;
inline constexpr double CFG_BATTERY_CAP=1200;
inline constexpr double CFG_GEYSER_HEAT=85;
inline constexpr double CFG_GEYSER_BURST=90;
inline constexpr double CFG_GEYSER_REST_MIN=400;
inline constexpr double CFG_GEYSER_REST_MAX=900;
inline constexpr double CFG_GEYSER_SPOUT=14;
inline constexpr double CFG_VENT_EVERY=40;
inline constexpr bool DEVICE_KIND(int id){ switch(id){case 11:case 12:case 13:case 14:case 15:case 16:case 17:case 26:case 27:case 28:case 29:case 30:case 31:case 32:case 33:case 34:case 35:case 41:case 42:case 43:case 52:case 57:case 58:case 59:case 60:case 61:case 64:case 65:case 66:return true;default:return false;} }
struct ContactRule {int block,kind,to_block,to_liquid; double to_temp,slag,above,rate,uses,heat; int gas,gas_amount; std::array<double,NSOL> solutes; bool alone,air,sealed,wet_air,salt_faster,use_touch; int touch1,touch2,touch_liquid; double touch_temp;};
inline constexpr ContactRule CONTACT_RULES[]={
{70,0,0,0,20,0,-1e30,0.05,45,20,22,160,{10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{53,0,0,0,20,0,-1e30,0.06,45,20,22,160,{10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{54,0,0,0,20,0,-1e30,0.06,45,20,22,160,{10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{44,0,0,0,20,0,-1e30,0.15,45,20,22,200,{12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{74,0,0,0,20,0,-1e30,0.05,45,20,22,60,{4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{71,0,0,0,20,0,-1e30,0.06,60,150,0,0,{16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{72,0,0,0,20,0,-1e30,0.06,60,150,0,0,{16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{76,0,0,0,20,0,-1e30,0.03,50,60,29,160,{0,0,0,0,0,0,0,0,0,0,0,40,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{24,0,0,0,20,0,-1e30,0.012,50,60,29,160,{0,0,0,0,0,0,0,0,0,0,0,40,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{75,0,0,0,20,0,-1e30,0.006,50,80,29,200,{0,0,0,0,0,0,0,0,0,0,0,40,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{68,0,0,0,20,0,-1e30,0.04,40,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,30,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{62,0,0,0,20,0,-1e30,0.004,60,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,40,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{1,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{48,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{4,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{5,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{6,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{18,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{19,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{20,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{36,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{37,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{79,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{46,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{47,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{50,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{55,0,0,0,20,0,-1e30,0.025,32,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{67,9,73,0,20,0,-1e30,0.05,20,100,8,120,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{75,1,0,0,20,0,-1e30,0.01,50,80,29,200,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{76,1,0,0,20,0,-1e30,0.006,50,40,29,120,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{50,1,0,0,20,0,-1e30,0.01,30,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{71,2,72,0,20,0,-1e30,0.08,40,600,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{24,2,68,0,20,0,-1e30,0.0003,0,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,true,true,false,0,0,0,20},
{51,2,78,0,20,0,-1e30,0.0002,0,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,true,false,false,0,0,0,20},
{72,25,70,0,20,0,-1e30,0.03,40,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},false,false,false,false,false,false,0,0,0,20},
{72,-1,70,0,20,0,-1e30,0.0008,0,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,true,false,false,false,false,0,0,0,20},
{70,-1,71,0,20,0,825,0.05,0,-300,22,160,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{53,-1,71,0,20,0,825,0.05,0,-300,22,160,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{54,-1,71,0,20,0,825,0.05,0,-300,22,160,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{72,-1,71,0,20,0,550,0.05,0,-100,8,60,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{44,-1,74,0,20,0,150,0.05,0,-50,22,120,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{68,-1,62,0,20,0,200,0.05,0,0,8,40,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{18,-1,73,0,20,0,300,0.03,0,0,17,60,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,true,false,false,false,0,0,0,20},
{21,-1,22,0,20,0,1000,0.05,0,0,22,60,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,true,44,74,0,20},
{21,-1,22,0,20,0,1700,0.05,0,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{62,-1,0,16,1450,0.3333333333333333,900,0.08,0,0,22,120,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,true,73,0,0,20},
{62,-1,0,31,1600,0,1565,0.05,0,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,false,0,0,0,20},
{75,-1,0,31,2500,0,1500,0.5,0,0,0,0,{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},true,false,false,false,false,true,68,62,16,2500}
};
inline constexpr int PAIR_BLOCK[]={0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,7,0,0,3,0,0,0,0,23,0,0,3,0,0,0,0,0,0,0,0,0,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,6,0,0,0,6,6,0,0,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,19,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,19,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,23,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0};
}
