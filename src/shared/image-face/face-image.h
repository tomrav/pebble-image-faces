// Shared Photo Face / franchise engine. Included by face-engine.h in dependency order.
// Putting an image on screen. Every display path (streamed, cached, built-in)
// goes through image_show_png() / image_show_resource(), which free what is
// shown before decoding, so the old image and the decoder never peak together.
//
// Pebble Round 2 (gabbro): a 260x260 bitmap at 8 bits is 67.6KB, and beside
// its PNG it does not fit the 128KB app heap. Round images therefore travel as
// a STRIP PACK: several 260-wide PNGs, each a band of rows, back to back
// (scripts/lib/emery-image.py writes them). They are decoded one strip at a
// time into a canvas that keeps only the pixels inside the circle, at 6 bits
// each, which is exactly the panel's 64 colours: ~39.8KB, no quality lost. A
// layer copies the canvas into the frame buffer. Anything else (a 200x228
// image from before Round 2) still takes the plain bitmap path.

#if defined(PBL_ROUND)
#define CANVAS_SIZE PBL_DISPLAY_WIDTH  // square panel

// Bytes of the PNG starting at p (signature through IEND), or 0 when the bytes
// there are not a well-formed PNG.
static uint32_t png_span(const uint8_t *p, uint32_t len) {
  static const uint8_t SIG[8] = { 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };
  if (len < 8 || memcmp(p, SIG, 8) != 0) { return 0; }
  uint32_t off = 8;
  while (len - off >= 12) {
    uint32_t n = ((uint32_t)p[off] << 24) | ((uint32_t)p[off + 1] << 16) |
                 ((uint32_t)p[off + 2] << 8) | p[off + 3];
    if (n > len - off - 12) { return 0; }
    bool end = memcmp(p + off + 4, "IEND", 4) == 0;
    off += 12 + n;
    if (end) { return off; }
  }
  return 0;
}

// A strip pack starts with a PNG exactly as wide as the panel (IHDR width sits
// at byte 16). Older 200x228 images keep the bitmap path.
static bool png_is_strip_pack(const uint8_t *p, uint32_t len) {
  if (len < 24 || !png_span(p, len)) { return false; }
  uint32_t w = ((uint32_t)p[16] << 24) | ((uint32_t)p[17] << 16) | ((uint32_t)p[18] << 8) | p[19];
  return w == CANVAS_SIZE;
}

// Visible span of each row: the pixels whose centres fall inside the circle
// inscribed in the panel, the same test as round_mask() in emery-image.py.
// Row y covers columns x0..SIZE-1-x0 and canvas pixels from s_row_start[y].
static uint8_t s_row_x0[CANVAS_SIZE];
static uint32_t s_row_start[CANVAS_SIZE + 1];

static void canvas_init_rows(void) {
  const int32_t s = CANVAS_SIZE;
  uint32_t idx = 0;
  for (int y = 0; y < s; y++) {
    int32_t dy = 2 * y + 1 - s;
    int x = 0;
    while (x < s / 2 && (2 * x + 1 - s) * (2 * x + 1 - s) + dy * dy > s * s) { x++; }
    s_row_x0[y] = x;
    s_row_start[y] = idx;
    idx += s - 2 * x;
  }
  s_row_start[s] = idx;
}

// One spare byte so a 6-bit read or write can always touch two bytes.
static uint32_t canvas_bytes(void) { return (s_row_start[CANVAS_SIZE] * 6 + 7) / 8 + 1; }

static void canvas_put(uint8_t *buf, uint32_t idx, uint8_t v) {
  uint32_t bit = idx * 6, i = bit >> 3, sh = bit & 7;
  uint16_t w = (uint16_t)(buf[i] | (buf[i + 1] << 8));
  w = (uint16_t)((w & ~(0x3F << sh)) | ((v & 0x3F) << sh));
  buf[i] = (uint8_t)w;
  buf[i + 1] = (uint8_t)(w >> 8);
}

static uint8_t canvas_get(const uint8_t *buf, uint32_t idx) {
  uint32_t bit = idx * 6, i = bit >> 3, sh = bit & 7;
  return (uint8_t)(((buf[i] | (buf[i + 1] << 8)) >> sh) & 0x3F);
}

static uint8_t *s_canvas;
static bool s_canvas_ok;
static Layer *s_canvas_layer;

// GColor8 (argb) of pixel x in one decoded row. The PNG decoder keeps a
// strip's palette depth, so a strip with few colours arrives palettized.
static uint8_t strip_px(GBitmapFormat fmt, const uint8_t *row, const GColor *pal, int x) {
  switch (fmt) {
    case GBitmapFormat8Bit:         return row[x];
    case GBitmapFormat4BitPalette:  return pal[(row[x >> 1] >> ((1 - (x & 1)) * 4)) & 0xF].argb;
    case GBitmapFormat2BitPalette:  return pal[(row[x >> 2] >> ((3 - (x & 3)) * 2)) & 0x3].argb;
    case GBitmapFormat1BitPalette:  return pal[(row[x >> 3] >> (7 - (x & 7))) & 0x1].argb;
    case GBitmapFormat1Bit:         return ((row[x >> 3] >> (x & 7)) & 1) ? GColorWhiteARGB8 : GColorBlackARGB8;
    default:                        return GColorBlackARGB8;
  }
}

// Decode a strip pack into the canvas, strip by strip. The canvas is written
// in place: nothing renders mid-decode, and a failure leaves it marked bad.
static bool canvas_decode(const uint8_t *data, uint32_t len) {
  uint32_t off = 0;
  int y0 = 0;
  while (off < len) {
    uint32_t n = png_span(data + off, len - off);
    if (!n) { APP_LOG(APP_LOG_LEVEL_ERROR, "Strip pack: bad PNG at byte %u", (unsigned int)off); return false; }
    GBitmap *strip = gbitmap_create_from_png_data(data + off, n);
    if (!strip) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "Strip pack: strip at row %d failed to decode (heap free=%u)",
              y0, (unsigned int)heap_bytes_free());
      return false;
    }
    GRect sb = gbitmap_get_bounds(strip);
    if (sb.size.w != CANVAS_SIZE || y0 + sb.size.h > CANVAS_SIZE) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "Strip pack: strip %dx%d at row %d does not fit",
              sb.size.w, sb.size.h, y0);
      gbitmap_destroy(strip);
      return false;
    }
    GBitmapFormat fmt = gbitmap_get_format(strip);
    const GColor *pal = gbitmap_get_palette(strip);
    for (int y = 0; y < sb.size.h; y++) {
      const uint8_t *row = gbitmap_get_data_row_info(strip, y).data;
      int cy = y0 + y, x0 = s_row_x0[cy];
      uint32_t idx = s_row_start[cy];
      for (int x = x0; x < CANVAS_SIZE - x0; x++) { canvas_put(s_canvas, idx++, strip_px(fmt, row, pal, x)); }
    }
    gbitmap_destroy(strip);
    off += n;
    y0 += sb.size.h;
  }
  return y0 == CANVAS_SIZE;
}

// Rows come from the frame buffer itself (gbitmap_get_data_row_info), so this
// holds whether the panel reports a circular or a plain 8-bit buffer.
static void canvas_update_proc(Layer *layer, GContext *ctx) {
  if (!s_canvas || !s_canvas_ok) { return; }
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  if (!fb) { return; }
  int h = gbitmap_get_bounds(fb).size.h;
  for (int y = 0; y < CANVAS_SIZE && y < h; y++) {
    GBitmapDataRowInfo ri = gbitmap_get_data_row_info(fb, y);
    int x0 = s_row_x0[y], x1 = CANVAS_SIZE - 1 - x0;
    int max_x = ri.max_x < CANVAS_SIZE - 1 ? ri.max_x : CANVAS_SIZE - 1;
    uint32_t base = s_row_start[y] - x0;
    for (int x = ri.min_x; x <= max_x; x++) {
      ri.data[x] = (x < x0 || x > x1) ? GColorBlackARGB8 : (uint8_t)(0xC0 | canvas_get(s_canvas, base + x));
    }
  }
  graphics_release_frame_buffer(ctx, fb);
}

static void canvas_free(void) {
  free(s_canvas);
  s_canvas = NULL;
  s_canvas_ok = false;
  if (s_canvas_layer) { layer_mark_dirty(s_canvas_layer); }
}
#endif

static void image_layers_create(Layer *root, GRect bounds) {
  s_image_layer = bitmap_layer_create(bounds);
  bitmap_layer_set_compositing_mode(s_image_layer, GCompOpSet);
  bitmap_layer_set_alignment(s_image_layer, GAlignCenter);
  layer_add_child(root, bitmap_layer_get_layer(s_image_layer));
#if defined(PBL_ROUND)
  canvas_init_rows();
  s_canvas_layer = layer_create(bounds);
  layer_set_update_proc(s_canvas_layer, canvas_update_proc);
  layer_add_child(root, s_canvas_layer);
#endif
}

static void image_layers_destroy(void) {
#if defined(PBL_ROUND)
  canvas_free();
  layer_destroy(s_canvas_layer);
  s_canvas_layer = NULL;
#endif
  bitmap_layer_destroy(s_image_layer);
  if (s_bitmap) {
    gbitmap_destroy(s_bitmap);
    s_bitmap = NULL;
  }
}

static void image_drop_bitmap(void) {
  bitmap_layer_set_bitmap(s_image_layer, NULL);
  if (s_bitmap) {
    gbitmap_destroy(s_bitmap);
    s_bitmap = NULL;
  }
}

// True while an image is on screen (either path).
static bool image_shown(void) {
#if defined(PBL_ROUND)
  if (s_canvas_ok) { return true; }
#endif
  return s_bitmap != NULL;
}

// Replace what is on screen with this PNG (or round strip pack). On failure
// the screen is left empty, as before.
static bool image_show_png(const uint8_t *data, uint32_t len) {
  image_drop_bitmap();
#if defined(PBL_ROUND)
  if (png_is_strip_pack(data, len)) {
    s_canvas_ok = false;
    if (!s_canvas) { s_canvas = malloc(canvas_bytes()); }
    if (!s_canvas) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "Canvas malloc %u failed (heap free=%u)",
              (unsigned int)canvas_bytes(), (unsigned int)heap_bytes_free());
    } else {
      s_canvas_ok = canvas_decode(data, len);
    }
    layer_mark_dirty(s_canvas_layer);
    return s_canvas_ok;
  }
  canvas_free();  // a plain bitmap needs the room
#endif
  s_bitmap = gbitmap_create_from_png_data(data, len);
  if (!s_bitmap) { return false; }
  bitmap_layer_set_bitmap(s_image_layer, s_bitmap);
  layer_mark_dirty(bitmap_layer_get_layer(s_image_layer));
  return true;
}

// Bundled images: a PNG resource on rectangular watches, a raw strip pack on
// round ones (same resource name; the package.json entries target per platform).
static bool image_show_resource(uint32_t resource_id) {
#if defined(PBL_ROUND)
  ResHandle h = resource_get_handle(resource_id);
  size_t n = resource_size(h);
  uint8_t *buf = malloc(n);
  if (!buf) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Built-in malloc %u failed (heap free=%u)",
            (unsigned int)n, (unsigned int)heap_bytes_free());
    return false;
  }
  resource_load(h, buf, n);
  bool ok = image_show_png(buf, n);
  free(buf);
  return ok;
#else
  image_drop_bitmap();
  s_bitmap = gbitmap_create_with_resource(resource_id);
  if (!s_bitmap) { return false; }
  bitmap_layer_set_bitmap(s_image_layer, s_bitmap);
  layer_mark_dirty(bitmap_layer_get_layer(s_image_layer));
  return true;
#endif
}
