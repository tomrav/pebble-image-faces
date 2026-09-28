// GENERATED from src/shared/image-face/face-overlay.h. Do not edit this copy.
// Shared Photo Face / franchise engine. Included by face-engine.h in dependency order.
// --- Overlay -----------------------------------------------------------------

// One Style setting drives both faces of the overlay as matched pairs:
//   0 Bold    BITHAM_42_BOLD      + GOTHIC_18_BOLD
//   1 Light   BITHAM_42_LIGHT     + GOTHIC_18
// Overlay colors. The ink applies to the clock AND the data points; the op
// (shadow / auto-bar) color is black or white by the ink's luminance, so any
// of the 64 palette inks keeps a readable outline. GColorFromHEX is exact
// for palette values (0x00/0x55/0xAA/0xFF per channel are the 2-bit steps).
static int eff_ink_hex(void) { return s_ov_ink >= 0 ? s_ov_ink : s_set.ink_hex; }
static int eff_bg(void) { return s_ov_bg >= 0 ? s_ov_bg : s_set.bg; }
static int eff_clock_pos(void) { return s_ov_pos >= 0 ? s_ov_pos : s_set.clock_pos; }

static GColor ink_color(void) {
  int h = eff_ink_hex();
  if (h >= 0) { return GColorFromHEX(h); }
  return (s_set.color == 1) ? GColorBlack : GColorWhite;
}

static GColor op_color(void) {
  int h = eff_ink_hex();
  if (h < 0) { return (s_set.color == 1) ? GColorWhite : GColorBlack; }
  int lum = (((h >> 16) & 0xff) * 3 + ((h >> 8) & 0xff) * 6 + (h & 0xff)) / 10;
  return (lum >= 128) ? GColorBlack : GColorWhite;
}

static GColor bar_color(void) {
  if (s_ov_bar >= 0) { return GColorFromHEX(s_ov_bar); }
  return (s_set.bar_hex >= 0) ? GColorFromHEX(s_set.bar_hex) : op_color();
}

//   2 Digital LECO_42_NUMBERS     + ROBOTO_CONDENSED_21 (LECO has no letters)
//   3 Pixel   VT323 44            + VT323 20
//   4 Script  Permanent Marker 32 + Permanent Marker 16
//   5 Typewriter Special Elite 34 + Special Elite 16
//   6 Neon    Monoton 30          + GOTHIC_18_BOLD (Monoton text is unreadable)
//   7 Poster  Abril Fatface 36    + Abril Fatface 16
//   8 Stencil Black Ops One 30    + Black Ops One 14
//   9 LCD     DSEG7 Classic 28    + ROBOTO_CONDENSED_21 (7-segment has no letters)
// Custom clock fonts are subset to digits+colon, the data-point variants to
// printable ASCII. Loaded LAZILY, one clock + one info handle at a time —
// ten always-resident fonts would be a pointless heap tax.
#define STYLE_COUNT 10
// Size steps for the clock and (paired) data points: 0 small, 1 medium — the
// original sizes above — 2 large. Bundled styles get a real cut per step; the
// three system styles use the nearest built-in face (no Bitham/LECO larger
// than 42, so their Large is Medium).
#define SIZE_COUNT 3
static const uint32_t CLOCK_FONT_RES[STYLE_COUNT][SIZE_COUNT] = {
  { 0, 0, 0 }, { 0, 0, 0 }, { 0, 0, 0 },
  { RESOURCE_ID_FONT_PIXEL_34, RESOURCE_ID_FONT_PIXEL_44, RESOURCE_ID_FONT_PIXEL_56 },
  { RESOURCE_ID_FONT_SCRIPT_24, RESOURCE_ID_FONT_SCRIPT_32, RESOURCE_ID_FONT_SCRIPT_40 },
  { RESOURCE_ID_FONT_TYPE_26, RESOURCE_ID_FONT_TYPE_34, RESOURCE_ID_FONT_TYPE_42 },
  { RESOURCE_ID_FONT_NEON_22, RESOURCE_ID_FONT_NEON_30, RESOURCE_ID_FONT_NEON_38 },
  { RESOURCE_ID_FONT_POSTER_28, RESOURCE_ID_FONT_POSTER_36, RESOURCE_ID_FONT_POSTER_44 },
  { RESOURCE_ID_FONT_STENCIL_22, RESOURCE_ID_FONT_STENCIL_30, RESOURCE_ID_FONT_STENCIL_38 },
  { RESOURCE_ID_FONT_LCD_22, RESOURCE_ID_FONT_LCD_28, RESOURCE_ID_FONT_LCD_36 },
};
static const uint32_t INFO_FONT_RES[STYLE_COUNT][SIZE_COUNT] = {
  { 0, 0, 0 }, { 0, 0, 0 }, { 0, 0, 0 },
  { RESOURCE_ID_FONT_PIXEL_16, RESOURCE_ID_FONT_PIXEL_20, RESOURCE_ID_FONT_PIXEL_26 },
  { RESOURCE_ID_FONT_SCRIPT_13, RESOURCE_ID_FONT_SCRIPT_16, RESOURCE_ID_FONT_SCRIPT_20 },
  { RESOURCE_ID_FONT_TYPE_13, RESOURCE_ID_FONT_TYPE_16, RESOURCE_ID_FONT_TYPE_20 },
  { 0, 0, 0 },
  { RESOURCE_ID_FONT_POSTER_13, RESOURCE_ID_FONT_POSTER_16, RESOURCE_ID_FONT_POSTER_20 },
  { RESOURCE_ID_FONT_STENCIL_12, RESOURCE_ID_FONT_STENCIL_14, RESOURCE_ID_FONT_STENCIL_18 },
  { 0, 0, 0 },
};
static GFont s_clock_cf, s_info_cf;
static int s_clock_cf_key = -1, s_info_cf_key = -1;

static GFont custom_font(GFont *slot, int *slot_key, const uint32_t table[][SIZE_COUNT],
                         int style, int size) {
  int key = style * SIZE_COUNT + size;
  if (*slot_key != key) {
    if (*slot) { fonts_unload_custom_font(*slot); *slot = NULL; }
    if (table[style][size]) {
      *slot = fonts_load_custom_font(resource_get_handle(table[style][size]));
    }
    *slot_key = key;
  }
  return *slot;
}

static GFont clock_font_for(int size) {
  switch (s_set.font) {
    case 0: return fonts_get_system_font(size == 0 ? FONT_KEY_BITHAM_30_BLACK
                                                   : FONT_KEY_BITHAM_42_BOLD);
    case 1: return fonts_get_system_font(size == 0 ? FONT_KEY_BITHAM_34_MEDIUM_NUMBERS
                                                   : FONT_KEY_BITHAM_42_LIGHT);
    case 2: return fonts_get_system_font(size == 0 ? FONT_KEY_LECO_28_LIGHT_NUMBERS
                                                   : FONT_KEY_LECO_42_NUMBERS);
    default: break;
  }
  GFont f = custom_font(&s_clock_cf, &s_clock_cf_key, CLOCK_FONT_RES, s_set.font, size);
  return f ? f : fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD);
}

// Large + seconds can outgrow the 200px panel for the widest styles. Measured
// in apply_layout() whenever style/seconds change; while true the clock (and
// its paired data points) render at Medium instead of clipping.
static bool s_large_too_wide;

static int eff_font_size(void) {
  if (s_set.font_size == 2 && s_set.seconds && s_large_too_wide) { return 1; }
  return s_set.font_size;
}

static GFont clock_font(void) { return clock_font_for(eff_font_size()); }

// Empty rows above the digits inside the clock box, per style and size.
// Measured in the Emery emulator (first white row of "20:05" with the box at
// y = 0, shadow excluded). Used only to seat a top clock under the row above
// it; the system styles' Large is their Medium cut, hence the repeats.
static const uint8_t CLOCK_INK_TOP[STYLE_COUNT][SIZE_COUNT] = {
  {  9, 12, 12 },  // 0 Bitham bold
  { 10, 12, 12 },  // 1 Bitham light
  {  8, 13, 13 },  // 2 LECO digital
  { 14, 19, 24 },  // 3 Pixel
  {  6,  8,  9 },  // 4 Script
  {  7,  9, 12 },  // 5 Typewriter
  {  3,  5,  6 },  // 6 Neon
  {  8, 10, 13 },  // 7 Poster
  {  7, 10, 13 },  // 8 Stencil
  {  0,  0,  0 },  // 9 LCD
};

// Clock block height per size step (48 is what the original 42px fonts use).
static int clock_height(void) {
  static const int H[SIZE_COUNT] = { 38, 48, 60 };
  return H[eff_font_size()];
}

static GFont info_font(void) {
  int size = eff_font_size();
  static const char *const GOTHIC_BOLD[SIZE_COUNT] = {
    FONT_KEY_GOTHIC_14_BOLD, FONT_KEY_GOTHIC_18_BOLD, FONT_KEY_GOTHIC_24_BOLD };
  static const char *const GOTHIC[SIZE_COUNT] = {
    FONT_KEY_GOTHIC_14, FONT_KEY_GOTHIC_18, FONT_KEY_GOTHIC_24 };
  if (!s_set.font_all) { return fonts_get_system_font(GOTHIC_BOLD[size]); }
  switch (s_set.font) {
    case 1: return fonts_get_system_font(GOTHIC[size]);
    case 2: case 9: return fonts_get_system_font(FONT_KEY_ROBOTO_CONDENSED_21);  // its only cut
    case 6: return fonts_get_system_font(GOTHIC_BOLD[size]);
    default: break;
  }
  GFont f = custom_font(&s_info_cf, &s_info_cf_key, INFO_FONT_RES, s_set.font, size);
  return f ? f : fonts_get_system_font(GOTHIC_BOLD[size]);
}

static void update_time(void) {
  time_t now = time(NULL);
  struct tm *t = localtime(&now);

  static char time_buf[12];
  bool h24 = (s_set.time_fmt == 0) ? clock_is_24h_style() : (s_set.time_fmt == 2);
  strftime(time_buf, sizeof(time_buf),
           s_set.seconds ? (h24 ? "%H:%M:%S" : "%I:%M:%S")
                         : (h24 ? "%H:%M" : "%I:%M"), t);
  text_layer_set_text(s_time_layer, time_buf);
  text_layer_set_text(s_time_shadow, time_buf);
}

// Sample text for one data point. Adding a data point = one case here.
static void dp_text(int dp, char *out, size_t n) {
  out[0] = '\0';
  switch (dp) {
    case DP_DATE: {
      time_t now = time(NULL);
      struct tm *t = localtime(&now);
      strftime(out, n, "%a %d", t);
      break;
    }
    case DP_BATT: {
      BatteryChargeState st = battery_state_service_peek();
      snprintf(out, n, "%d%%", st.charge_percent);
      break;
    }
#if defined(PBL_HEALTH)
    case DP_STEPS: {
      HealthValue steps = health_service_sum_today(HealthMetricStepCount);
      snprintf(out, n, "%d", (int)steps);
      break;
    }
    case DP_HR: {
      // Peek rather than subscribe: the overlay already refreshes every minute,
      // and holding a HR subscription open costs battery on a face that is only
      // ever glanced at. 0 means the sensor has no recent reading.
      HealthValue bpm = 0;
      if (health_service_metric_accessible(HealthMetricHeartRateBPM,
                                           time(NULL), time(NULL)) == HealthServiceAccessibilityMaskAvailable) {
        bpm = health_service_peek_current_value(HealthMetricHeartRateBPM);
      }
      if (bpm > 0) { snprintf(out, n, "%d bpm", (int)bpm); }
      else { snprintf(out, n, "-- bpm"); }
      break;
    }
#endif
    case DP_TEMP:
      if (s_temp_known) { snprintf(out, n, "%d°", s_temp_val); }
      else { snprintf(out, n, "--°"); }
      break;
    default: break;  // DP_COND / DP_CONN are glyphs, never text (see dp_visible)
  }
}

// Whether a placed data point currently has anything to show. Glyph points
// have presence rules of their own: the condition needs a known value, and
// the phone point only speaks up while DISCONNECTED (streamed photos stop
// working, and the glyph says why).
static bool dp_visible(int dp) {
  if (dp == DP_COND) { return s_cond_val >= 0; }
  if (dp == DP_CONN) { return !connection_service_peek_pebble_app_connection(); }
  char probe[24];
  dp_text(dp, probe, sizeof(probe));
  return probe[0] != '\0';
}

static bool dp_is_glyph(int dp) { return dp == DP_COND || dp == DP_CONN; }

static void apply_layout(void);

// 20x20 glyphs from graphics primitives (system fonts carry no weather or
// phone icons). Drawn in the overlay text color with the same 1px drop shadow
// the text gets when the backdrop is set to shadow.
#define GLYPH_PX 20
#define COND_PX GLYPH_PX
#define SPIN_PX 22
// Crescent moon outlines (opening to the upper right), precomputed as the
// boundary of a disc minus an offset bite circle. Big = standalone in the
// 20px glyph box; small = peeking over the cloud in the partly-cloudy
// composite. Regenerate with the two-circle script in the repo history.
static const GPoint MOON_BIG[] = {
  {17, 15}, {14, 17}, {11, 18}, {7, 17}, {4, 15}, {2, 12}, {2, 9}, {3, 6},
  {6, 3}, {9, 2}, {8, 4}, {7, 7}, {8, 10}, {9, 12}, {11, 14}, {14, 15},
};
static const GPoint MOON_SMALL[] = {
  {9, 8}, {7, 9}, {5, 10}, {3, 10}, {1, 8}, {0, 6}, {0, 4}, {1, 2},
  {2, 1}, {4, 0}, {4, 1}, {3, 3}, {4, 5}, {4, 6}, {6, 7}, {7, 8},
};
static void draw_cond_shape(GContext *ctx, GColor color, int dx, int dy) {
  graphics_context_set_fill_color(ctx, color);
  graphics_context_set_stroke_color(ctx, color);
  graphics_context_set_stroke_width(ctx, 2);
  int cond = COND_BUCKET(s_cond_val);
  bool night = COND_NIGHT(s_cond_val);
  bool cloudy = (cond == COND_PART || cond == COND_CLOUD || cond == COND_RAIN
                 || cond == COND_SNOW || cond == COND_STORM);
  if (cond == COND_SUN || cond == COND_PART) {
    GPoint c = cloudy ? GPoint(dx + 6, dy + 6) : GPoint(dx + 10, dy + 10);
    int r = cloudy ? 3 : 5;
    if (night) {
      // Moon: a true crescent polygon (big disc minus an offset bite, tips
      // tapering) precomputed at build time — a ring segment read as half a
      // donut. Beside a cloud it moves up-left so the shapes stay separate.
      static const GPathInfo big_info = { ARRAY_LENGTH(MOON_BIG), (GPoint *)MOON_BIG };
      static const GPathInfo small_info = { ARRAY_LENGTH(MOON_SMALL), (GPoint *)MOON_SMALL };
      GPathInfo info = cloudy ? small_info : big_info;
      GPath *moon = gpath_create(&info);
      gpath_move_to(moon, cloudy ? GPoint(dx, dy - 2) : GPoint(dx, dy));
      gpath_draw_filled(ctx, moon);
      gpath_destroy(moon);
    } else {
      // Sun: disc + 8 short thin rays (a fat 4-ray cross reads as a sparkle).
      graphics_fill_circle(ctx, c, r);
      graphics_context_set_stroke_width(ctx, 1);
      static const int8_t dir[8][2] = { {1,0},{-1,0},{0,1},{0,-1},{1,1},{1,-1},{-1,1},{-1,-1} };
      int a = r + 2, z = r + 4;           // ray from just off the disc, 3px long
      for (int i = 0; i < 8; i++) {
        int ax = dir[i][0], ay = dir[i][1];
        int a1 = (ax && ay) ? a - 1 : a;  // pull diagonals in ~1px (sqrt2)
        int z1 = (ax && ay) ? z - 1 : z;
        graphics_draw_line(ctx, GPoint(c.x + ax * a1, c.y + ay * a1),
                                GPoint(c.x + ax * z1, c.y + ay * z1));
      }
      graphics_context_set_stroke_width(ctx, 2);
    }
  }
  if (cloudy) {
    // Cloud: two discs + a base bar. Sits low in the frame so the small sun
    // of COND_PART peeks out top-left instead of merging into one blob.
    int cy = (cond == COND_PART) ? dy + 2 : dy;
    graphics_fill_circle(ctx, GPoint(dx + 8, cy + 11), 4);
    graphics_fill_circle(ctx, GPoint(dx + 13, cy + 9), 5);
    graphics_fill_rect(ctx, GRect(dx + 6, cy + 11, 12, 4), 0, GCornerNone);
  }
  if (cond == COND_FOG) {
    for (int i = 0; i < 3; i++) {
      graphics_fill_rect(ctx, GRect(dx + 2, dy + 6 + i * 4, 16, 2), 0, GCornerNone);
    }
  }
  if (cond == COND_RAIN) {
    for (int i = 0; i < 3; i++) {
      graphics_draw_line(ctx, GPoint(dx + 7 + i * 4, dy + 16), GPoint(dx + 6 + i * 4, dy + 19));
    }
  }
  if (cond == COND_SNOW) {
    for (int i = 0; i < 3; i++) {
      graphics_fill_circle(ctx, GPoint(dx + 7 + i * 4, dy + 17), 1);
    }
  }
  if (cond == COND_STORM) {
    graphics_draw_line(ctx, GPoint(dx + 12, dy + 14), GPoint(dx + 9, dy + 18));
    graphics_draw_line(ctx, GPoint(dx + 9, dy + 18), GPoint(dx + 13, dy + 17));
    graphics_draw_line(ctx, GPoint(dx + 13, dy + 17), GPoint(dx + 10, dy + 21));
  }
}

// Phone-disconnected: a small phone outline (speaker slit up top) with a
// slash through it. Wider than tall-and-thin so it doesn't read as Ø.
static void draw_conn_shape(GContext *ctx, GColor color, int dx, int dy) {
  graphics_context_set_stroke_color(ctx, color);
  graphics_context_set_fill_color(ctx, color);
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_round_rect(ctx, GRect(dx + 5, dy + 2, 11, 17), 2);
  graphics_fill_rect(ctx, GRect(dx + 8, dy + 6, 5, 2), 0, GCornerNone);
  graphics_draw_line(ctx, GPoint(dx + 2, dy + 18), GPoint(dx + 18, dy + 2));
}

static void bars_update_proc(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, bar_color());
  for (int i = 0; i < s_bar_n; i++) {
    graphics_fill_rect(ctx, GRect(0, s_bar_y0[i], b.size.w, s_bar_y1[i] - s_bar_y0[i]),
                       0, GCornerNone);
  }
}

// Loading spinner: dark disc, bright rotating arc, in its OWN layer placed
// by cell geometry — an overlay, never part of the cell's text run, so its
// appearing and disappearing can shift neither the clock nor any text.
static void spinner_update_proc(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_circle(ctx, GPoint(b.size.w / 2, b.size.h / 2), b.size.w / 2);
  graphics_context_set_fill_color(ctx, GColorWhite);
  int32_t span = TRIG_MAX_ANGLE * 110 / 360;
  graphics_fill_radial(ctx, b, GOvalScaleModeFitCircle, 4, s_spin_angle, s_spin_angle + span);
}

static void draw_dp_glyph(int dp, GContext *ctx, GColor color, int dx, int dy) {
  if (dp == DP_COND) { draw_cond_shape(ctx, color, dx, dy); }
  else { draw_conn_shape(ctx, color, dx, dy); }
}

// Rebuild each cell's segment list: items sharing a cell flow HORIZONTALLY
// from that spot in ascending seq (placement) order, text joined like the
// classic info line — "87% · 72 bpm" — and glyphs drawn inline in the run.
static void update_info(void) {
  for (int c = 0; c < CELLS; c++) { s_cell_nseg[c] = 0; }

  for (int seq = 0; seq < DP_COUNT; seq++) {
    for (int dp = 0; dp < DP_COUNT; dp++) {
      if (dp == DP_SPIN) { continue; }  // overlay layer, not a run segment
      int v = s_set.dp_pos[dp];
      if (v == 0 || DP_SEQ(v) != seq) { continue; }
      int c = DP_CELL(v) - 1;
      if (c < 0 || c >= CELLS) { continue; }
      if (!dp_visible(dp)) { continue; }
      s_cell_seg[c][s_cell_nseg[c]++] = dp;
    }
  }

  for (int c = 0; c < CELLS; c++) {
    if (s_cell_layer[c]) { layer_mark_dirty(s_cell_layer[c]); }
  }
  // Content heights feed cell frames, so geometry always follows content.
  apply_layout();
}

// A cell's line height: the real single-line height of the CURRENT info font
// (Roboto Condensed 21 is taller than the Gothic 18s) when any text renders,
// or the glyph square for glyph-only cells. 0 = empty cell.
static int cell_content_height(int c, GFont font, int w) {
  if (s_cell_nseg[c] == 0) { return 0; }
  bool has_text = false;
  for (int i = 0; i < s_cell_nseg[c]; i++) {
    if (!dp_is_glyph(s_cell_seg[c][i])) { has_text = true; break; }
  }
  if (!has_text) { return GLYPH_PX; }
  GSize size = graphics_text_layout_get_content_size(
      "0j", font, GRect(0, 0, w, 100),
      GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter);
  return size.h;
}

// Draw one pass of a cell's segment run (called twice for the drop shadow).
static void draw_cell_run(GContext *ctx, int c, GFont font, GColor color,
                          int x, int dy, int text_h, int glyph_y) {
  graphics_context_set_text_color(ctx, color);
  const GTextOverflowMode om = GTextOverflowModeTrailingEllipsis;
  for (int i = 0; i < s_cell_nseg[c]; i++) {
    int dp = s_cell_seg[c][i];
    if (i > 0) {
      GSize sw = graphics_text_layout_get_content_size(" · ", font,
          GRect(0, 0, 100, 40), om, GTextAlignmentLeft);
      graphics_draw_text(ctx, " · ", font, GRect(x, dy, sw.w + 2, text_h + 4),
                         om, GTextAlignmentLeft, NULL);
      x += sw.w;
    }
    if (dp_is_glyph(dp)) {
      draw_dp_glyph(dp, ctx, color, x, glyph_y + dy);
      x += GLYPH_PX;
    } else {
      char t[24];
      dp_text(dp, t, sizeof(t));
      GSize ts = graphics_text_layout_get_content_size(t, font,
          GRect(0, 0, 300, 40), om, GTextAlignmentLeft);
      graphics_draw_text(ctx, t, font, GRect(x, dy, ts.w + 2, text_h + 4),
                         om, GTextAlignmentLeft, NULL);
      x += ts.w;
    }
  }
}

// A cell paints itself: optional solid bar, optional shadow pass, then the
// run. Overflow simply clips at the layer edge (the settings-page preview
// shows the same truncation).
static void cell_update_proc(Layer *layer, GContext *ctx) {
  int c = 0;
  while (c < CELLS && s_cell_layer[c] != layer) { c++; }
  if (c >= CELLS || s_cell_nseg[c] == 0) { return; }

  GRect b = layer_get_bounds(layer);
  GFont font = info_font();
  GColor fg = ink_color();
  GColor op = op_color();

  int text_h = b.size.h - 4;
  int glyph_y = (text_h - GLYPH_PX) / 2 + 2;
  if (glyph_y < 0) { glyph_y = 0; }

  // Total run width -> start x per column alignment (left/center/right).
  int total = 0;
  for (int i = 0; i < s_cell_nseg[c]; i++) {
    int dp = s_cell_seg[c][i];
    if (i > 0) {
      total += graphics_text_layout_get_content_size(" · ", font,
          GRect(0, 0, 100, 40), GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft).w;
    }
    if (dp_is_glyph(dp)) { total += GLYPH_PX; }
    else {
      char t[24];
      dp_text(dp, t, sizeof(t));
      total += graphics_text_layout_get_content_size(t, font,
          GRect(0, 0, 300, 40), GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft).w;
    }
  }

  int col = c % 3;
  int x = (col == 0) ? 0 : (col == 2) ? b.size.w - total : (b.size.w - total) / 2;
  if (x < 0) { x = 0; }  // overflowing run pins left and clips at the right

  // The solid bar is drawn by s_bars_layer (full-width, merged bands) — a
  // cell paints only its shadow pass and run.
  if (eff_bg() == 0) { draw_cell_run(ctx, c, font, op, x + 1, 1, text_h, glyph_y); }
  draw_cell_run(ctx, c, font, fg, x, 0, text_h, glyph_y);
}

// Apply settings to the overlay layers: positions, font, colors, backdrop.
static void apply_layout(void) {
  if (!s_time_layer) { return; }
  Layer *root = window_get_root_layer(s_window);
  GRect b = layer_get_bounds(root);

  // Large + seconds: check once per (style, seconds) whether the widest
  // sample still fits the panel; eff_font_size() drops to Medium if not.
  {
    static int measured_for = -1;
    int key = (s_set.font_size == 2 && s_set.seconds) ? s_set.font + 1 : 0;
    if (key != measured_for) {
      measured_for = key;
      s_large_too_wide = false;
      if (key) {
        GSize tw = graphics_text_layout_get_content_size("88:88:88", clock_font_for(2),
            GRect(0, 0, 400, 100), GTextOverflowModeWordWrap, GTextAlignmentLeft);
        s_large_too_wide = tw.w > b.size.w - 4;
      }
    }
  }
  const int clock_h = clock_height();
  const int under_cell = eff_clock_pos() * 3 + 2;  // center cell of the clock's row
  GFont inf = info_font();

  // The clock block reserves room for the stack directly under it, so a
  // bottom-row clock never pushes that stack off screen (same block model as
  // the old single info line). Measured, so wrapped stacks reserve two lines.
  int block_h = clock_h + cell_content_height(under_cell - 1, inf, b.size.w - 8);

  // EDGE_PAD keeps top/bottom rows (and the bottom clock block) a touch off
  // the panel edge so data points never sit flush against it.
  const int EDGE_PAD = 6;
  // Top mirrors bottom: the clock-row stack hugs its screen edge and the
  // clock sits on its inner side (bottom: clock then text at the bottom edge;
  // top: text at the top edge, clock below it). The bottom stack can tuck
  // 4px into the clock box because digits leave slack under them. A TOP
  // clock has to clear the row above it, and how much of its box is empty
  // above the digits is a property of the style (CLOCK_INK_TOP: 24px for
  // Pixel Large, none at all for LCD), so a fixed tuck put LCD and Neon
  // digits through the row. Place the digits' INK a fixed TOP_GAP under the
  // row's ink (which reaches ~2px past its content height).
  const int TOP_GAP = 6;
  int clock_y;
  switch (eff_clock_pos()) {
    case 0: {
      int inset = ((unsigned)s_set.font < STYLE_COUNT) ? CLOCK_INK_TOP[s_set.font][eff_font_size()] : 0;
      clock_y = (block_h > clock_h) ? EDGE_PAD + (block_h - clock_h) + 2 + TOP_GAP - inset : 0;
      if (clock_y < 0) { clock_y = 0; }
      break;
    }
    case 1: clock_y = (b.size.h - block_h) / 2; break;
    default: clock_y = b.size.h - block_h - EDGE_PAD; break;
  }

  // With seconds on, a centered layer would re-center every tick as digit
  // widths change, wobbling the whole clock. Anchor it instead: left-align
  // at the origin the current minute's centered time would have, so HH:MM
  // stays put and only the seconds digits repaint in place.
  GRect clock_rect = GRect(0, clock_y, b.size.w, clock_h);
  GTextAlignment clock_align = GTextAlignmentCenter;
  if (s_set.seconds) {
    // Center on THIS MINUTE's time with seconds normalized to :00 — properly
    // centered, recomputed only when the minute flips (apply_layout runs on
    // every minute tick), pixel-stable in between.
    time_t now = time(NULL);
    struct tm *tm_now = localtime(&now);
    bool h24s = (s_set.time_fmt == 0) ? clock_is_24h_style() : (s_set.time_fmt == 2);
    char samp[12];
    strftime(samp, sizeof(samp), h24s ? "%H:%M:00" : "%I:%M:00", tm_now);
    GSize tw = graphics_text_layout_get_content_size(
        samp, clock_font(), GRect(0, 0, b.size.w, clock_h + 20),
        GTextOverflowModeWordWrap, GTextAlignmentLeft);
    // Slim digits (the 1s especially) skew the visual mass leftward once
    // seconds are on; a small constant optical shift rightward compensates.
    int x = (b.size.w - tw.w) / 2 + 3;
    if (x < 0) { x = 0; }
    clock_rect = GRect(x, clock_y, b.size.w - x, clock_h);
    clock_align = GTextAlignmentLeft;
  }
  text_layer_set_text_alignment(s_time_layer, clock_align);
  text_layer_set_text_alignment(s_time_shadow, clock_align);
  layer_set_frame(text_layer_get_layer(s_time_layer), clock_rect);
  layer_set_frame(text_layer_get_layer(s_time_shadow),
                  GRect(clock_rect.origin.x + 2, clock_rect.origin.y + 2,
                        clock_rect.size.w, clock_rect.size.h));

  GColor fg = ink_color();
  GColor op = op_color();
  bool shadow = (eff_bg() == 0);

  text_layer_set_text_color(s_time_layer, fg);
  text_layer_set_text_color(s_time_shadow, op);
  layer_set_hidden(text_layer_get_layer(s_time_shadow), !shadow);
  // The solid bar is drawn by s_bars_layer (full-width, merged bands), never
  // by the text layer — an anchored seconds clock would otherwise shrink it.
  text_layer_set_background_color(s_time_layer, GColorClear);

  // Bar bands wanted this layout pass: the clock's, plus one per occupied
  // cell (collected in the loop below).
  int16_t want0[MAX_BARS], want1[MAX_BARS];
  int want_n = 0;
  want0[want_n] = clock_y;
  want1[want_n] = clock_y + clock_h;
  want_n++;

  GFont cf = clock_font();
  text_layer_set_font(s_time_layer, cf);
  text_layer_set_font(s_time_shadow, cf);

  // Grid cells. Row bands anchor top/center/bottom; columns set alignment.
  // Cells in the clock's row cooperate with it: the center cell stacks under
  // the clock (the classic layout), side cells center on the clock digits.
  for (int c = 0; c < CELLS; c++) {
    if (!s_cell_layer[c]) { continue; }
    int text_h = cell_content_height(c, inf, b.size.w - 8);
    bool empty = (text_h == 0);
    layer_set_hidden(s_cell_layer[c], empty);
    if (empty) { continue; }

    int row = c / 3, col = c % 3;

    int y;
    if (row == eff_clock_pos()) {
      y = (col == 1) ? (eff_clock_pos() == 0 ? EDGE_PAD          // above a top clock
                                             : clock_y + clock_h - 4)  // under it otherwise
                     : clock_y + (clock_h - text_h) / 2 + 6;    // beside the digits
    } else if (row == 0) {
      y = EDGE_PAD;
    } else if (row == 1) {
      y = (b.size.h - text_h) / 2;
    } else {
      y = b.size.h - text_h - EDGE_PAD;
    }

    layer_set_frame(s_cell_layer[c], GRect(4, y, b.size.w - 8, text_h + 4));
    layer_mark_dirty(s_cell_layer[c]);

    if (want_n < MAX_BARS) {
      want0[want_n] = y;
      want1[want_n] = y + text_h + 4;
      want_n++;
    }
  }

  // Merge the wanted bands into the final bar list: sort by top, then join
  // any band that overlaps or touches (≤2px) the one before it — the clock
  // and the stack on its line become a single bar with no seam, while other
  // rows keep their own.
  for (int i = 1; i < want_n; i++) {
    int16_t a0 = want0[i], a1 = want1[i];
    int j = i - 1;
    while (j >= 0 && want0[j] > a0) {
      want0[j + 1] = want0[j];
      want1[j + 1] = want1[j];
      j--;
    }
    want0[j + 1] = a0;
    want1[j + 1] = a1;
  }
  s_bar_n = 0;
  for (int i = 0; i < want_n; i++) {
    if (s_bar_n > 0 && want0[i] <= s_bar_y1[s_bar_n - 1] + 2) {
      if (want1[i] > s_bar_y1[s_bar_n - 1]) { s_bar_y1[s_bar_n - 1] = want1[i]; }
    } else {
      s_bar_y0[s_bar_n] = want0[i];
      s_bar_y1[s_bar_n] = want1[i];
      s_bar_n++;
    }
  }
  if (s_bars_layer) {
    layer_set_hidden(s_bars_layer, eff_bg() != 1);
    layer_mark_dirty(s_bars_layer);
  }

  // The loading spinner sits at its cell's alignment as an overlay — same
  // band and column math as the cells, but outside the text runs, so it can
  // never move the clock or reflow a stack when it pops in.
  if (s_spinner_layer) {
    int v = s_set.dp_pos[DP_SPIN];
    layer_set_hidden(s_spinner_layer, v == 0 || !s_spin_visible);
    if (v != 0) {
      int sc = DP_CELL(v) - 1;
      int row = sc / 3, col = sc % 3;
      int y;
      if (row == eff_clock_pos()) {
        y = (col == 1) ? (eff_clock_pos() == 0 ? EDGE_PAD : clock_y + clock_h - 2)
                       : clock_y + (clock_h - SPIN_PX) / 2 + 6;
      } else if (row == 0) { y = EDGE_PAD; }
      else if (row == 1) { y = (b.size.h - SPIN_PX) / 2; }
      else { y = b.size.h - SPIN_PX - EDGE_PAD; }
      int x = (col == 0) ? 4 : (col == 2) ? b.size.w - SPIN_PX - 4
                                          : (b.size.w - SPIN_PX) / 2;
      layer_set_frame(s_spinner_layer, GRect(x, y, SPIN_PX, SPIN_PX));
    }
  }

  layer_mark_dirty(root);
}
