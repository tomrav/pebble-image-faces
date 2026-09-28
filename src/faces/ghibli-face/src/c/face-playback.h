// GENERATED from src/shared/image-face/face-playback.h. Do not edit this copy.
// Shared Photo Face / franchise engine. Included by face-engine.h in dependency order.
// Spinner shown while a shake-triggered fetch is in flight — ported from
// touch-glass: a white arc over a dark disc, revealed only after a short delay
// so bundled replies (one AppMessage round-trip) and fast streams never flash
// it; a safety timer hides it if nothing ever arrives. Timer-driven rotation
// deliberately never spins — those advances happen while nobody is watching.
#define SPINNER_SHOW_DELAY_MS 400


static void spin_tick(void *data) {
  s_spin_angle = (s_spin_angle + TRIG_MAX_ANGLE / 24) % TRIG_MAX_ANGLE;
  if (s_spinner_layer) { layer_mark_dirty(s_spinner_layer); }
  s_spin_timer = app_timer_register(60, spin_tick, NULL);
}

static void loading_timeout(void *data) {
  s_load_timeout = NULL;
  set_loading(false);
}

static void spinner_show(void *data) {
  s_spin_show_timer = NULL;
  s_spin_visible = true;
  if (s_spinner_layer && s_set.dp_pos[DP_SPIN] != 0) {
    layer_set_hidden(s_spinner_layer, false);
  }
  if (!s_spin_timer) { s_spin_timer = app_timer_register(60, spin_tick, NULL); }
}

static void set_loading(bool on) {
  if (on) {
    if (s_spin_show_timer) { app_timer_reschedule(s_spin_show_timer, SPINNER_SHOW_DELAY_MS); }
    else if (!s_spin_visible) {
      s_spin_show_timer = app_timer_register(SPINNER_SHOW_DELAY_MS, spinner_show, NULL);
    }
    if (s_load_timeout) { app_timer_reschedule(s_load_timeout, 10000); }
    else { s_load_timeout = app_timer_register(10000, loading_timeout, NULL); }
  } else {
    if (s_spin_show_timer) { app_timer_cancel(s_spin_show_timer); s_spin_show_timer = NULL; }
    if (s_spin_timer) { app_timer_cancel(s_spin_timer); s_spin_timer = NULL; }
    if (s_load_timeout) { app_timer_cancel(s_load_timeout); s_load_timeout = NULL; }
    s_spin_visible = false;
    if (s_spinner_layer) { layer_set_hidden(s_spinner_layer, true); }
  }
}

// --- Playback ---------------------------------------------------------------
// The watch plays the selection itself. It has the ids (SEL_IDS), the structure
// (SEL_GROUPS: which group each entry is in and whether that group loops), the
// cursor (s_sel_pos) and, for anything bundled or cached, the bytes — so an
// advance is a flash read, not a Bluetooth round-trip, and looks the same
// offline. The phone keeps the same cursor by listening to CURSOR_IDX, and
// supplies bytes when the watch asks for an entry it doesn't hold (REQUEST_IDX).
static void apply_layout(void);
static void update_info(void);

// Per-image overrides pack into one 32-bit word, so an image can carry its own
// look: byte0 clock pos + 1, byte1 ink + 1, byte2 backdrop + 1, byte3 bar + 1,
// with 0 meaning "no override". Colors are 6-bit Pebble palette indices — a
// 0xRRGGBB value can't fit a byte, and the display truncates each channel to
// 2 bits anyway (GColorFromHEX), so the round trip is pixel-identical.
// A streamed image keeps its word in its slot header; a built-in keeps it in
// PERSIST_KEY_BUILTIN_OV_BASE + index.
static uint8_t ov_pack_color(int hex) {
  if (hex < 0) { return 0; }
  int r = ((hex >> 16) & 0xff) >> 6, g = ((hex >> 8) & 0xff) >> 6, b = (hex & 0xff) >> 6;
  return (uint8_t)(1 + (r << 4) + (g << 2) + b);
}

static int ov_unpack_color(uint8_t v) {
  if (v == 0) { return -1; }
  v--;
  return ((((v >> 4) & 3) * 85) << 16) | ((((v >> 2) & 3) * 85) << 8) | ((v & 3) * 85);
}

static uint32_t ov_pack(int pos, int ink, int bg, int bar) {
  uint32_t w = (uint32_t)(pos < 0 ? 0 : pos + 1) & 0xff;
  w |= (uint32_t)ov_pack_color(ink) << 8;
  w |= ((uint32_t)(bg < 0 ? 0 : bg + 1) & 0xff) << 16;
  w |= (uint32_t)ov_pack_color(bar) << 24;
  return w;
}

static void ov_persist(void) { state_dirty(); }

// Put a packed word on screen. Word 0 means this image has no overrides, which
// is what clear_overrides() did on every local advance before images carried
// their own look.
static void ov_apply(uint32_t w) {
  int pos = (int)(w & 0xff) - 1;
  int bg = (int)((w >> 16) & 0xff) - 1;
  pos = (pos >= 0 && pos <= 2) ? pos : -1;
  bg = (bg >= 0 && bg <= 2) ? bg : -1;
  int ink = ov_unpack_color((uint8_t)((w >> 8) & 0xff));
  int bar = ov_unpack_color((uint8_t)((w >> 24) & 0xff));
  // Most images have no overrides at all, and the watch now applies a word on
  // EVERY advance — so bail before a relayout when nothing actually differs
  // from what is already on screen.
  if (pos == s_ov_pos && ink == s_ov_ink && bg == s_ov_bg && bar == s_ov_bar) { return; }
  s_ov_pos = pos;
  s_ov_ink = ink;
  s_ov_bg = bg;
  s_ov_bar = bar;
  ov_persist();
  apply_layout();
  update_info();
}

static void clear_overrides(void) {
  if (s_ov_pos == -1 && s_ov_ink == -1 && s_ov_bg == -1 && s_ov_bar == -1) { return; }
  s_ov_pos = s_ov_ink = s_ov_bg = s_ov_bar = -1;
  ov_persist();
}

static uint32_t ov_word_for(uint32_t id) {
  if (ID_IS_BUILTIN(id)) {
    int i = (int)id - 1;
    return (i < BUILTIN_OV_MAX) ? s_builtin_ov[i] : 0;
  }
  int slot = img_slot_find(id);
  return (slot >= 0) ? s_slot[slot].flags : 0;
}

static void ov_store_for(uint32_t id, uint32_t w) {
  if (ID_IS_BUILTIN(id)) {
    int i = (int)id - 1;
    if (i < BUILTIN_OV_MAX && s_builtin_ov[i] != w) { s_builtin_ov[i] = w; bov_dirty(); }
    return;
  }
  int slot = img_slot_find(id);
  if (slot < 0 || s_slot[slot].flags == w) { return; }
  // Header only: the pixels are untouched, so this is one 16-byte write and the
  // run stays valid throughout (len and hash keep their values).
  ImgSlotHdr h;
  if (persist_read_data(SLOT_HDR_KEY(slot), &h, sizeof(h)) != (int)sizeof(h)) { return; }
  h.flags = w;
  if (persist_write_data(SLOT_HDR_KEY(slot), &h, sizeof(h)) == (int)sizeof(h)) {
    s_slot[slot].flags = w;
    index_dirty();
  }
}

// The handshake reply (CACHE_LIST) is 8 bytes per entry: id then packed
// overrides, both uint32 LE. Static, not a local: 480 bytes is a lot of stack
// for an AppMessage callback.
#define CACHE_LIST_MAX 60
static uint8_t s_cache_list[CACHE_LIST_MAX * 8];

static void cache_list_put(int at, uint32_t id, uint32_t flags) {
  uint8_t *p = s_cache_list + at * 8;
  for (int i = 0; i < 4; i++) {
    p[i] = (id >> (i * 8)) & 0xff;
    p[4 + i] = (flags >> (i * 8)) & 0xff;
  }
}

// The whole connect handshake is one reply: what the watch holds and under what
// look (CACHE_LIST), where its cursor is (CURSOR_IDX) and whether it is stuck on
// a blank backdrop (NEED_IMAGE). Built-ins are listed too — the phone reconciles
// their overrides the same way. Unnamed (id 0) slots are left out: the phone
// can't match them to a ref, and claiming them would only suppress a needed
// prefetch.
//
// It RETRIES on a busy outbox. A CURSOR_IDX from the SEL_IDS that arrived a
// moment earlier can still be in flight, and a dropped reply costs the phone a
// 1500 ms timeout and a pointless image push.
#define HS_RETRY_MS 100
#define HS_RETRIES  12
static AppTimer *s_hs_timer;
static int s_hs_tries;

static void handshake_reply(void *data) {
  s_hs_timer = NULL;
  int n = 0;
  for (unsigned int i = 0; i < BUILTIN_COUNT && n < CACHE_LIST_MAX; i++) {
    cache_list_put(n++, ID_BUILTIN(i), ov_word_for(ID_BUILTIN(i)));
  }
  for (int s = 0; s < SLOT_COUNT && n < CACHE_LIST_MAX; s++) {
    if (!s_slot[s].len || s_slot[s].id == ID_NONE) { continue; }
    cache_list_put(n++, s_slot[s].id, s_slot[s].flags);
  }
  int cursor = (s_sel_n > 0) ? s_sel_pos : -1;
  DictionaryIterator *out;
  AppMessageResult r = app_message_outbox_begin(&out);
  if (r != APP_MSG_OK) {
    if (++s_hs_tries <= HS_RETRIES) {
      s_hs_timer = app_timer_register(HS_RETRY_MS, handshake_reply, NULL);
    } else {
      APP_LOG(APP_LOG_LEVEL_WARNING, "CACHE_QUERY: outbox stayed busy, no reply sent");
    }
    return;
  }
  dict_write_data(out, MESSAGE_KEY_CACHE_LIST, s_cache_list, (uint16_t)(n * 8));
  dict_write_int32(out, MESSAGE_KEY_CURSOR_IDX, cursor);
  dict_write_int32(out, MESSAGE_KEY_NEED_IMAGE, s_need_image ? 1 : 0);
  app_message_outbox_send();
  APP_LOG(APP_LOG_LEVEL_INFO,
          "CACHE_QUERY -> CACHE_LIST %d entries, CURSOR_IDX %d, NEED_IMAGE %d, %u bytes used",
          n, cursor, s_need_image ? 1 : 0, (unsigned int)s_slot_used);
}

// Direct callers must cancel a pending retry before reusing the callback.
static void handshake_reply_now(void) {
  if (s_hs_timer) { app_timer_cancel(s_hs_timer); s_hs_timer = NULL; }
  s_hs_tries = 0;
  handshake_reply(NULL);
}

// --- Choosing the next entry -------------------------------------------------
#define SEL_GROUP(i) (s_sel_grp[i] & 0x7f)
#define SEL_LOOPS(i) ((s_sel_grp[i] & 0x80) != 0)

// Can the watch draw this entry on its own?
static bool sel_available(int i) {
  uint32_t id = s_sel[i];
  return ID_IS_BUILTIN(id) || img_slot_find(id) >= 0;
}

static void set_sel_pos(int idx) {
  if (s_sel_pos == idx) { return; }
  s_sel_pos = idx;
  state_dirty();
}

// Sequential: the next entry in the same group; at the end of a group, back to
// its first entry if the group loops, else on to the first entry of the next
// group (wrapping). The franchise faces send one looping group, which makes
// this (cursor + 1) % n; photo-face's enabled galleries are the groups, and
// this is its nextPhoto() rule for rule.
static int pick_sequential(void) {
  int cur = s_sel_pos;
  if (cur < 0 || cur >= s_sel_n) { return 0; }
  int g = SEL_GROUP(cur), end = cur;
  while (end + 1 < s_sel_n && SEL_GROUP(end + 1) == g) { end++; }
  if (cur < end) { return cur + 1; }
  if (SEL_LOOPS(cur)) {
    int start = cur;
    while (start > 0 && SEL_GROUP(start - 1) == g) { start--; }
    return start;
  }
  return (end + 1) % s_sel_n;
}

// Shuffle: a 64-bit "shown this cycle" mask over the selection (SEL_MAX is 64,
// which is why one word does). Pick uniformly from the entries not yet shown,
// preferring a group other than the current one so consecutive photos come from
// different galleries, and never the entry already on screen. When the cycle is
// exhausted it resets — the phone's shufflePick(), moved onto the watch.
static uint64_t s_shown_mask;
static int s_pick_diff[SEL_MAX], s_pick_same[SEL_MAX];

// --- Debounced persistence --------------------------------------------------
// One record for everything a shake changes. sel_n says whether SEL_IDS /
// SEL_GROUPS exist at all, so launch never probes for them.
typedef struct {
  uint32_t version;     // SCHEMA_VERSION that wrote it
  Settings set;
  int32_t temp_val;
  uint8_t temp_known;
  uint8_t pad0[3];
  uint32_t active_id;
  int32_t sel_n;
  int32_t sel_pos;
  int32_t ov_pos, ov_ink, ov_bg, ov_bar;
  uint64_t shown_mask;
  int32_t active_image;
  uint8_t last_streamed;
  uint8_t pad[3];
  // --- appended in SCHEMA_VERSION 4 (a version-3 record ends above) ---
  int32_t active_slot;      // -1 = the on-screen image is not a cached slot
  uint32_t active_len;
  uint32_t active_hash;
} FaceState;
#define FACESTATE_V3_SIZE offsetof(FaceState, active_slot)

#define FLUSH_MS 5000
static bool s_state_dirty, s_index_dirty, s_bov_dirty;
static bool s_settings_dirty;  // durable configuration, unlike best-effort playback
static AppTimer *s_flush_timer;

static void state_flush_now(void) {
  if (s_flush_timer) { app_timer_cancel(s_flush_timer); s_flush_timer = NULL; }
  time_t sec; uint16_t ms; time_ms(&sec, &ms);
  uint32_t t0 = (uint32_t)sec * 1000u + ms;
  int wrote = 0;
  if (s_state_dirty) {
    FaceState st = {
      .version = SCHEMA_VERSION, .set = s_set,
      .temp_val = s_temp_val, .temp_known = s_temp_known ? 1 : 0, .pad0 = { 0, 0, 0 },
      .active_id = s_active_id, .sel_n = s_sel_n, .sel_pos = s_sel_pos,
      .ov_pos = s_ov_pos, .ov_ink = s_ov_ink, .ov_bg = s_ov_bg, .ov_bar = s_ov_bar,
      .shown_mask = s_shown_mask, .active_image = s_current_image,
      .last_streamed = s_last_streamed ? 1 : 0, .pad = { 0, 0, 0 },
      .active_slot = s_active_slot, .active_len = s_active_len, .active_hash = s_active_hash,
    };
    if (persist_write_data(PERSIST_KEY_STATE, &st, sizeof(st)) == (int)sizeof(st)) { s_state_dirty = false; s_settings_dirty = false; }
    wrote++;
  }
  if (s_index_dirty && s_slot_ready) {
    for (int i = 0; i < SLOT_COUNT; i++) {
      s_idx_ids[i] = s_slot[i].id; s_idx_lens[i] = (uint16_t)s_slot[i].len; s_idx_flags[i] = s_slot[i].flags;
    }
    bool ok = persist_write_data(PERSIST_KEY_IDX_IDS, s_idx_ids, sizeof(s_idx_ids)) == (int)sizeof(s_idx_ids);
    ok = persist_write_data(PERSIST_KEY_IDX_LENS, s_idx_lens, sizeof(s_idx_lens)) == (int)sizeof(s_idx_lens) && ok;
    ok = persist_write_data(PERSIST_KEY_IDX_FLAGS, s_idx_flags, sizeof(s_idx_flags)) == (int)sizeof(s_idx_flags) && ok;
    if (ok) { s_index_dirty = false; }
    wrote += 3;
  }
  if (s_bov_dirty) {
    if (persist_write_data(PERSIST_KEY_BUILTIN_OV, s_builtin_ov, sizeof(s_builtin_ov)) == (int)sizeof(s_builtin_ov)) {
      s_bov_dirty = false;
    }
    wrote++;
  }
  if (wrote) {
    time_ms(&sec, &ms);
    APP_LOG(APP_LOG_LEVEL_INFO, "Persist flush: %d record(s) in %ums",
            wrote, (unsigned int)((uint32_t)sec * 1000u + ms - t0));
  }
}

static void state_flush_on_exit(void) {
  if (s_flush_timer) { app_timer_cancel(s_flush_timer); s_flush_timer = NULL; }
  s_state_dirty = s_settings_dirty;
  s_index_dirty = false;  // recoverable from committed image headers
  if (s_settings_dirty || s_bov_dirty) { state_flush_now(); }
}

static void flush_timer_cb(void *data) {
  s_flush_timer = NULL;
  if (s_read_buf || s_requested_idx >= 0 || (s_img_buf && !s_img_prefetch)) {
    s_flush_timer = app_timer_register(FLUSH_MS, flush_timer_cb, NULL);
    return;
  }
  state_flush_now();
}

static void schedule_flush(void) {
  if (s_flush_timer) { app_timer_cancel(s_flush_timer); }
  s_flush_timer = app_timer_register(FLUSH_MS, flush_timer_cb, NULL);
}

static void state_dirty(void) { s_state_dirty = true; schedule_flush(); }
static void index_dirty(void) { s_index_dirty = true; schedule_flush(); }
static void bov_dirty(void)   { s_bov_dirty = true; schedule_flush(); }

// --- Deferred launch load ------------------------------------------------------
// Every persist lookup costs a scan of the whole store (~0.5 s with 400 KB of
// images). Launch therefore reads the boot record and the on-screen image, and
// nothing else, until the face has painted. The slot index, the built-in
// overrides and the selection load a moment later — or on demand, the moment a
// shake or a phone message needs them.
static bool s_loaded;        // index + built-in overrides + selection are in RAM
static int s_boot_sel_n;     // sel_n from the boot record (0 = no SEL_IDS on flash)
static int s_schema_seen;    // SCHEMA value read at init; != SCHEMA_VERSION -> rewrite
static void load_selection(void);
static void img_slot_load_index(void);

static void ensure_loaded(void) {
  if (s_loaded) { return; }
  s_loaded = true;
  time_t sec; uint16_t ms; time_ms(&sec, &ms);
  uint32_t t0 = (uint32_t)sec * 1000u + ms;
  img_slot_load_index();
  cache_alloc_init();
  if (persist_read_data(PERSIST_KEY_BUILTIN_OV, s_builtin_ov, sizeof(s_builtin_ov)) != (int)sizeof(s_builtin_ov)) {
    memset(s_builtin_ov, 0, sizeof(s_builtin_ov));
  }
  if (s_boot_sel_n > 0) { load_selection(); }
  if (s_sel_n > 0) {
    APP_LOG(APP_LOG_LEVEL_INFO, "Selection restored: %d image(s), cursor %d, active id=%08x",
            s_sel_n, s_sel_pos, (unsigned int)s_active_id);
  }
  if (s_schema_seen != SCHEMA_VERSION) {
    // Upgraded record layout: rewrite the boot record now and stamp the schema.
    s_state_dirty = true;
    state_flush_now();
    persist_write_int(PERSIST_KEY_SCHEMA, SCHEMA_VERSION);
  }
  time_ms(&sec, &ms);
  APP_LOG(APP_LOG_LEVEL_INFO, "Deferred load: %ums", (unsigned int)((uint32_t)sec * 1000u + ms - t0));
}

static void deferred_load_cb(void *data) { ensure_loaded(); }

static int pick_shuffle(void) {
  if (s_sel_n <= 1) { return 0; }
  int cg = (s_sel_pos >= 0 && s_sel_pos < s_sel_n) ? SEL_GROUP(s_sel_pos) : -1;
  for (int pass = 0; pass < 2; pass++) {
    int nd = 0, ns = 0;
    for (int i = 0; i < s_sel_n; i++) {
      if (s_shown_mask & ((uint64_t)1 << i)) { continue; }
      if (i == s_sel_pos) { continue; }  // never an immediate repeat
      if (SEL_GROUP(i) != cg) { s_pick_diff[nd++] = i; } else { s_pick_same[ns++] = i; }
    }
    int pick = -1;
    if (nd > 0) { pick = s_pick_diff[rand() % nd]; }
    else if (ns > 0) { pick = s_pick_same[rand() % ns]; }
    if (pick >= 0) {
      s_shown_mask |= (uint64_t)1 << pick;
      state_dirty();
      return pick;
    }
    // Everything but the current entry has been shown: start a new cycle. The
    // second pass only comes up empty if the selection IS the current entry.
    s_shown_mask = 0; state_dirty();
  }
  return (s_sel_pos >= 0) ? s_sel_pos : 0;
}

static int pick_next(void) {
  if (s_sel_n <= 0) { return -1; }
  return s_set.shuffle ? pick_shuffle() : pick_sequential();
}

// --- Showing --------------------------------------------------------------
// Draw selection entry `idx` from the watch's own storage, with that image's
// look. False = the watch doesn't hold it (the caller asks the phone, or skips
// past it).
static bool show_index(int idx) {
  if (idx < 0 || idx >= s_sel_n) { return false; }
  uint32_t id = s_sel[idx];
  uint32_t w = ov_word_for(id);
  if (ID_IS_BUILTIN(id)) {
    show_builtin((int)id - 1);
  } else {
    if (!show_slot(id)) { return false; }
    s_read_idx = idx;
    return true;
  }
  set_sel_pos(idx);
  ov_apply(w);
  return true;
}

// Tell the phone where the watch moved to, so its cursor (and the settings
// page) stay in step. Best effort by design: if the outbox is busy the phone
// finds out at the next handshake instead.
static void notify_cursor(int idx) {
  if (!connection_service_peek_pebble_app_connection()) { return; }
  reply_id(MESSAGE_KEY_CURSOR_IDX, (uint32_t)idx);
}

// Completion is the only place an asynchronous cached display commits its
// cursor/overrides or tells the phone it succeeded.
static void cache_read_complete(bool ok, uint32_t id, uint32_t flags, int idx, bool ack) {
  if (id != s_desired_id) { return; }
  if (!ok) {
    s_need_image = !s_bitmap;
    set_loading(false);
    if (ack) { reply_id(MESSAGE_KEY_CACHE_MISS, id); }
    else if (connection_service_peek_pebble_app_connection()) {
      if (idx < 0) { for (int i = 0; i < s_sel_n; i++) { if (s_sel[i] == id) { idx = i; break; } } }
      if (idx >= 0) { request_idx(idx); }
      else { handshake_reply_now(); }
    } else { s_desired_id = s_active_id; }
    return;
  }
  cancel_fallback();
  set_loading(false);
  set_active_id(id, true);
  if (idx < 0) { for (int i = 0; i < s_sel_n; i++) { if (s_sel[i] == id) { idx = i; break; } } }
  if (idx >= 0) { set_sel_pos(idx); notify_cursor(idx); }
  ov_apply(flags);
  if (ack) { reply_id(MESSAGE_KEY_CACHE_ACK, id); }
  APP_LOG(APP_LOG_LEVEL_INFO, "Cached image displayed: id=%08x cursor=%d", (unsigned int)id, s_sel_pos);
}

// Walk the selection forward from `idx` and show the first entry the watch can
// draw itself. Used offline and when the phone doesn't answer a REQUEST_IDX —
// the Phase 1 local_advance(), generalised to start anywhere.
static bool skip_to_next_available(int idx) {
  if (s_sel_n <= 0) { return false; }
  if (idx < 0 || idx >= s_sel_n) { idx = 0; }
  for (int step = 0; step < s_sel_n; step++) {
    int at = (idx + step) % s_sel_n;
    if (s_sel[at] == s_active_id || !sel_available(at) || !show_index(at)) { continue; }
    APP_LOG(APP_LOG_LEVEL_INFO, "Selected available image %d/%d (id=%08x), skipped %d",
            at + 1, s_sel_n, (unsigned int)s_sel[at], step);
    return true;
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "Local advance: no selected image is on the watch");
  return false;
}

static void local_advance(void *data) {
  cancel_request();
  s_fallback_timer = NULL;  // safe as a timer callback; direct callers go
                            // through local_advance_now() so no armed timer
                            // is ever orphaned by this assignment
  if (s_sel_n > 0) {
    if (skip_to_next_available(s_sel_pos)) { if (!s_read_buf) { notify_cursor(s_sel_pos); } }
    else { s_desired_id = s_active_id; img_transfer_reset(); set_loading(false); }
    return;  // Never display an unselected built-in as a successful advance.
  }
  // No selection at all (a phone JS older than 1.1.0), or nothing selected is
  // on the watch: cycle the bundled built-ins as 1.0.12 did. A built-in reached
  // this way has no known look — drop the last image's overrides.
  clear_overrides();
  apply_layout();
  update_info();
  APP_LOG(APP_LOG_LEVEL_INFO, "Advancing locally through the built-ins (phone unavailable)");
  show_builtin((s_current_image + 1) % (int)BUILTIN_COUNT);
}

static void local_advance_now(void) {
  cancel_fallback();
  local_advance(NULL);
}

// How long the watch waits for the phone before choosing something itself.
#define FALLBACK_MS 8000

// Launch fallback: the phone never re-sent the streamed image that was on
// screen at exit, so show the saved built-in after all. Deferred while a
// transfer is mid-flight — show_builtin() would drop its reassembly buffer.
static void restore_builtin(void *data) {
  s_fallback_timer = NULL;
  if (s_img_buf || s_read_buf) {
    s_fallback_timer = app_timer_register(FALLBACK_MS, restore_builtin, NULL);
    return;
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "No streamed image from the phone; showing saved built-in");
  show_builtin(s_current_image);
}

static void arm_fallback(void) {
  if (s_fallback_timer) { app_timer_reschedule(s_fallback_timer, FALLBACK_MS); }
  else { s_fallback_timer = app_timer_register(FALLBACK_MS, local_advance, NULL); }
}

// Ask the phone for one selection entry by position. False = nothing is coming,
// so the caller should pick something it already has instead.
static void cancel_request(void) {
  if (s_request_expiry) { app_timer_cancel(s_request_expiry); s_request_expiry = NULL; }
  if (s_request_timer) { app_timer_cancel(s_request_timer); s_request_timer = NULL; }
  s_requested_idx = -1;
  s_request_tries = 0;
}

static void request_expired(void *data) {
  s_request_expiry = NULL;
  cancel_request();
  set_loading(false);
  if (!s_need_image) { s_desired_id = s_active_id; }
  APP_LOG(APP_LOG_LEVEL_INFO, "Image request expired; another shake or reconnect can retry");
}

static void request_retry(void *data) {
  s_request_timer = NULL;
  if (s_requested_idx >= 0) { request_idx(s_requested_idx); }
}

static bool request_idx(int idx) {
  if (idx < 0 || idx >= s_sel_n) { return false; }
  if (s_requested_idx != idx) {
    cancel_request();
    s_requested_idx = idx;
    s_desired_id = s_sel[idx];
    s_request_expiry = app_timer_register(20000, request_expired, NULL);
  }
  DictionaryIterator *out;
  AppMessageResult r = app_message_outbox_begin(&out);
  if (r == APP_MSG_OK) {
    dict_write_int32(out, MESSAGE_KEY_REQUEST_IDX, idx);
    r = app_message_outbox_send();
  }
  if (r != APP_MSG_OK) {
    if (++s_request_tries < 8 && !s_request_timer) {
      s_request_timer = app_timer_register(150, request_retry, NULL);
    }
    APP_LOG(APP_LOG_LEVEL_INFO, "Image request %d deferred (%d), attempt %d", idx, (int)r, s_request_tries);
    if (s_request_tries >= 8) {
      if (s_request_expiry) { app_timer_cancel(s_request_expiry); s_request_expiry = NULL; }
      request_expired(NULL);
    }
    return false;
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "Image request %d sent (id=%08x)", idx, (unsigned int)s_desired_id);
  return true;
}

// One advance, from a shake or the rotation timer. `spin` shows the fetch
// spinner — true only for shake-triggered advances, and only when the watch
// actually has to wait for the phone; timer rotation stays visually silent.
static void advance_photo(bool spin) {
  s_minutes_since_rotate = 0;
  ensure_loaded();

  // Legacy: a phone JS older than 1.1.0 never sends a selection, so it still
  // owns the cursor and the watch has to ask (and fall back locally).
  if (s_sel_n <= 0 || s_legacy_phone) {
    if (!connection_service_peek_pebble_app_connection()) {
      local_advance_now();
      return;
    }
    DictionaryIterator *out;
    AppMessageResult r = app_message_outbox_begin(&out);
    if (r != APP_MSG_OK) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "outbox begin failed (%d)", (int)r);
      // BUSY = the previous request is still in flight; its reply (or its
      // fallback timer) will advance the image — advancing here too would
      // double-step on rapid shakes.
      if (r != APP_MSG_BUSY) { local_advance_now(); }
      return;
    }
    dict_write_uint8(out, MESSAGE_KEY_REQUEST_NEXT, 1);
    app_message_outbox_send();
    APP_LOG(APP_LOG_LEVEL_INFO, "Requested next image");
    if (spin) { set_loading(true); }
    arm_fallback();
    return;
  }

  // Coalesce gestures while a remote image is pending. It remains one advance,
  // even when the phone needs several seconds; the cursor commits on display.
  if (s_requested_idx >= 0 || s_read_buf) { return; }
  int idx = pick_next();
  // Duplicate refs across galleries are positions, not new pictures. Walk the
  // normal playback policy so a looping single-photo gallery still stays put.
  for (int n = 0; idx >= 0 && s_sel[idx] == s_active_id && n < s_sel_n; n++) {
    set_sel_pos(idx); idx = pick_next();
  }
  if (idx < 0 || s_sel[idx] == s_active_id) { notify_cursor(s_sel_pos); return; }
  s_desired_id = s_sel[idx];
  if (show_index(idx)) {
    cancel_fallback();
    if (s_read_buf) { if (spin) { set_loading(true); } return; }
    APP_LOG(APP_LOG_LEVEL_INFO, "Local advance to %d/%d (id=%08x) -> CURSOR_IDX %d",
            idx + 1, s_sel_n, (unsigned int)s_sel[idx], idx);
    notify_cursor(idx);
    return;
  }
  if (connection_service_peek_pebble_app_connection()) {
    request_idx(idx);
    if (spin) { set_loading(true); }
    arm_fallback();
    return;
  }
  // Offline and not on the watch: move on to something that is.
  if (!skip_to_next_available(idx)) { s_desired_id = s_active_id; set_loading(false); }
}
