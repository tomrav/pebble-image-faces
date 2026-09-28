// GENERATED from src/shared/image-face/face-state.h. Do not edit this copy.
// Shared Photo Face / franchise engine. Included by face-engine.h in dependency order.
// Persistent-storage keys.
#define PERSIST_KEY_ACTIVE_IMAGE 1
#define PERSIST_KEY_ROTATE_MIN   2
#define PERSIST_KEY_SHAKE        3
#define PERSIST_KEY_CLOCK_POS    4
// 5..8 and 14 were the old show_date/batt/steps/temp/hr bools; still read once
// for migration (see load_settings), never written again.
#define PERSIST_KEY_OLD_SHOW_DATE  5
#define PERSIST_KEY_OLD_SHOW_BATT  6
#define PERSIST_KEY_OLD_SHOW_STEPS 7
#define PERSIST_KEY_OLD_SHOW_TEMP  8
#define PERSIST_KEY_FONT         9
#define PERSIST_KEY_COLOR        10
#define PERSIST_KEY_BG           11
#define PERSIST_KEY_TEMP_VAL     12
#define PERSIST_KEY_TEMP_SET     13
#define PERSIST_KEY_OLD_SHOW_HR  14
#define PERSIST_KEY_DP_BASE      15  // 15..29 reserved: one position per data point
#define PERSIST_KEY_TIME_FMT     30
#define PERSIST_KEY_SECONDS      31
#define PERSIST_KEY_FONT_ALL     32
#define PERSIST_KEY_INK_HEX      33
#define PERSIST_KEY_BAR_HEX      34
#define PERSIST_KEY_OV_BASE      35  // 35..38: current image's pos/ink/bg/bar overrides
#define PERSIST_KEY_LAST_STREAMED 39 // the image on screen at exit was streamed
#define PERSIST_KEY_FONT_SIZE    40  // clock + data-point size step 0..2
#define PERSIST_KEY_SEL_IDS      41  // the phone's ordered selection, packed ids
#define PERSIST_KEY_ACTIVE_ID    42  // id of the image on screen at exit
#define PERSIST_KEY_SEL_POS      43  // cursor: index into SEL_IDS
#define PERSIST_KEY_SEL_GROUPS   44  // one byte per selection entry (group+loop)
#define PERSIST_KEY_SHUFFLE      45  // 1 = shuffle the selection, 0 = walk it
// 50..69: packed per-image overrides for the built-ins (streamed images keep
// theirs in their slot header). One int per built-in index.
// 50..69 were a per-built-in override table in a pre-release 1.3.0 build; retired
// unshipped (one record at PERSIST_KEY_BUILTIN_OV replaces it). Never reuse.
#define BUILTIN_OV_MAX              20
// The persist store is a flat file: a key that EXISTS is found fast, a key that
// does NOT costs a full scan of the file (~0.8 s with 400 KB of images cached),
// and every write appends until the file is compacted by rewriting it. So:
//   - PERSIST_KEY_SCHEMA present means every key the app reads is present; the
//     one allowed possibly-absent lookup per launch is SCHEMA itself.
//   - Even a key that exists costs a scan proportional to the file (~110 ms per
//     lookup at 400 KB, measured), so EVERYTHING scalar — settings, what is on
//     screen, the cursor, overrides, the shuffle mask, the temperature — lives
//     in ONE record, written by a debounced flush, never on a shake. Launch is
//     that record + the selection + the slot index: six lookups, not fifty.
//   - The slot table is read from three index records, not 48 headers.
#define PERSIST_KEY_STATE        70  // FaceState (see below)
#define PERSIST_KEY_IDX_IDS      71  // slot index: SLOT_COUNT ids
#define PERSIST_KEY_IDX_LENS     72  // slot index: SLOT_COUNT uint16 lens
#define PERSIST_KEY_IDX_FLAGS    73  // slot index: SLOT_COUNT packed overrides
#define PERSIST_KEY_SCHEMA       74  // schema version; presence = fully initialised store
#define PERSIST_KEY_BUILTIN_OV   75  // BUILTIN_OV_MAX packed override words, one record
#define SCHEMA_VERSION           4  // 3 = same record minus the active-slot fields
// 100.. is the image-slot cache (see SLOT_BASE below).

// --- Data points -------------------------------------------------------------
// Every overlay data point is a row here; adding one means a new enum entry, a
// row in DP_PERSIST/DP defs below, a case in dp_text(), and the matching S_POS_*
// message key (plus the PKJS/page side). Nothing about the grid changes.
//
// A data point's placement is one int: 0 = off, otherwise seq * 10 + cell,
// where cell is 1..9 on a 3x3 grid (1 top-left, row-major, 9 bottom-right) and
// seq is the placement order — items sharing a cell stack by ascending seq.
enum { DP_DATE, DP_BATT, DP_STEPS, DP_TEMP, DP_HR, DP_COND, DP_CONN, DP_SPIN, DP_COUNT };
#define DP_CELL(v) ((v) % 10)
#define DP_SEQ(v)  ((v) / 10)
#define CELLS 9

// Settings, pushed by the phone (S_* message keys) and persisted here.
typedef struct {
  int rotate_min;   // minutes between automatic image changes; 0 = never
  bool shake;       // wrist shake advances to the next image
  bool shuffle;     // pick the next image at random instead of in order
  int clock_pos;    // 0 = top, 1 = middle, 2 = bottom (the clock is row-only)
  int time_fmt;     // 0 = follow the system 12/24h setting, 1 = 12h, 2 = 24h
  int seconds;      // 1 = clock shows seconds (SECOND_UNIT ticks while on)
  int dp_pos[DP_COUNT]; // per data point: 0 = off, else seq*10 + cell
  int font;         // overlay style: 0 bold, 1 light, 2 digital, 3 pixel,
                    // 4 script (clock font; data points get the matched pair)
  int font_all;     // 1 = the style also picks the data-point font (pair);
                    // 0 = data points stay on the classic Gothic 18 Bold
  int font_size;    // 0 small, 1 medium, 2 large: clock and data points together
  int color;        // legacy 0 = white text, 1 = black text (kept on the wire
                    // for old phone JS; ink_hex wins when set)
  int ink_hex;      // 0xRRGGBB ink for clock + data points; -1 = from color
  int bar_hex;      // 0xRRGGBB solid-bar color; -1 = auto (inverse of ink)
  int bg;           // 0 = drop shadow, 1 = solid bar, 2 = none
} Settings;

static Settings s_set = {
  .rotate_min = 30, .shake = true, .shuffle = false, .clock_pos = 2, .time_fmt = 0, .seconds = 0,
  // Default: date in the cell under the clock (bottom-center), the loading
  // spinner beside it bottom-right (where it used to ride the clock line),
  // rest off.
  .dp_pos = { [DP_DATE] = 8, [DP_SPIN] = 19 },
  .font = 0, .font_all = 1, .font_size = 1, .color = 0, .ink_hex = -1, .bar_hex = -1, .bg = 0,
};

// Per-IMAGE overrides for whatever is currently displayed, pushed by the
// phone alongside each image (OV_* keys; -1 = no override, use the global
// setting). Persisted so an offline launch keeps the last image's look.
static int s_ov_pos = -1;   // clock row for this image
static int s_ov_ink = -1;   // 0xRRGGBB ink
static int s_ov_bg = -1;    // backdrop treatment 0/1/2
static int s_ov_bar = -1;   // 0xRRGGBB bar color

static Window *s_window;
static BitmapLayer *s_image_layer;
static GBitmap *s_bitmap;
static TextLayer *s_time_layer;
static TextLayer *s_time_shadow;
// One custom layer per grid cell. Cells draw their own content — a horizontal
// run of segments (text and drawn glyphs mixed), so an icon can sit anywhere
// in the flow. Hidden while the cell is empty.
static Layer *s_cell_layer[CELLS];
// Per cell: which data points render there, in placement (seq) order.
static int8_t s_cell_seg[CELLS][DP_COUNT];
static int s_cell_nseg[CELLS];

static int s_minutes_since_rotate;
static AppTimer *s_fallback_timer;  // local advance if the phone doesn't answer
static int s_temp_val;              // last temperature pushed by the phone
static bool s_temp_known;
// Weather condition bucket pushed by the phone (see COND_* below); -1 unknown.
static int s_cond_val = -1;

// Condition buckets, matching the PKJS weather_code mapping. Bit 3 of the
// wire value flags night: clear/partly-cloudy swap their sun for a moon.
enum { COND_SUN, COND_PART, COND_CLOUD, COND_FOG, COND_RAIN, COND_SNOW, COND_STORM };
#define COND_BUCKET(v) ((v) & 7)
#define COND_NIGHT(v)  (((v) & 8) != 0)

static bool s_spin_visible;         // shake-triggered fetch feedback (see below)
static Layer *s_spinner_layer;

// Solid-bar backdrop underlay. Bars are FULL-WIDTH bands, one per occupied
// row region; bands that touch — the clock and a stack on its line — merge
// into a single bar with no seam. apply_layout() computes the y-intervals,
// this layer just fills them (under every text/cell layer).
#define MAX_BARS (CELLS + 1)
static Layer *s_bars_layer;
static int s_bar_n;
static int16_t s_bar_y0[MAX_BARS], s_bar_y1[MAX_BARS];
static AppTimer *s_spin_timer;      // animation tick
static AppTimer *s_spin_show_timer; // delayed reveal
static AppTimer *s_load_timeout;    // safety hide
static int32_t s_spin_angle;

static void set_loading(bool on);

#define BUILTIN_COUNT (sizeof(s_builtin_resources) / sizeof(s_builtin_resources[0]))
