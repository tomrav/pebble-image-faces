// Shared Photo Face / franchise engine. Included by face-engine.h in dependency order.
// --- On-watch image cache: one slot per image -------------------------------
// PebbleOS v4.9.171 (2026-04-30) raised the per-app persist quota from 4 KiB
// to 1 MiB and added persist_get_max_size(). Records are still 256 bytes, so
// each streamed PNG lives on flash as a RUN of records under its own slot.
// 1.0.12 kept exactly one image (the one on screen); 1.1.0 keeps the whole
// selection, so a shake, the rotation timer and offline advance all come off
// flash with no Bluetooth round-trip and no spinner.
//
// Slot s owns SLOT_KEYS consecutive persist keys from SLOT_BASE: one header
// plus 128 data records (128 * 256 = MAX_IMAGE_BYTES). The header is written
// LAST and zeroed FIRST, so a half-written run never reads as valid. Slot 0 is
// the key range 1.0.12 used for its single image; its 8-byte header no longer
// validates against the 16-byte one, so upgrading costs one re-stream.
//
// Older firmware (< 4.9.171) has no quota to speak of and no
// persist_get_max_size() syscall: the whole cache stays off there and every
// image streams, exactly as it did before.
#define SLOT_BASE   100
#define SLOT_COUNT  48
#define SLOT_KEYS   129   // 1 header + MAX_IMAGE_BYTES / 256 data records
#define SLOT_HDR_KEY(s)  (SLOT_BASE + (s) * SLOT_KEYS)
#define SLOT_DATA_KEY(s) (SLOT_HDR_KEY(s) + 1)
#define IMG_CACHE_REC       PERSIST_DATA_MAX_LENGTH
#define IMG_CACHE_MIN_QUOTA (64 * 1024)
#define IMG_CACHE_HEADROOM  (4 * 1024)   // never fill the quota to the brim
#define IMG_CACHE_MIN_HEAP  (40 * 1024)  // below this, a prefetch is refused
#define IMG_CACHE_RECS_PER_TICK 1  // yield after each synchronous flash write

// 16 bytes. flags carries this image's packed per-image overrides (see
// ov_pack below), so the watch can apply the right look the moment it draws a
// cached image, with no phone in the loop.
typedef struct { uint32_t len; uint32_t hash; uint32_t id; uint32_t flags; } ImgSlotHdr;

// Image identity, computed identically here and in the PKJS:
//   built-in  id = 1 + index into s_builtin_resources (1..255)
//   streamed  id = 0x80000000 | (fnv1a32(ref) & 0x7fffffff)
//   0         "unnamed" — a legacy transfer that carried no IMG_ID
#define ID_NONE 0
#define ID_BUILTIN(i)     ((uint32_t)((i) + 1))
#define ID_IS_BUILTIN(id) ((id) >= 1 && (id) <= BUILTIN_COUNT)

// One in-RAM row per slot, built once at boot by img_slot_scan(): len 0 is an
// empty slot. 48 * 8 bytes beats re-reading 48 headers on every lookup.
static struct { uint32_t id; uint32_t len; uint32_t flags; } s_slot[SLOT_COUNT];
static uint32_t s_slot_used;   // sum of len over the valid slots
static bool s_slot_ready;      // the scan ran and the cache is usable

// Debounced persistence (see the PERSIST_KEY_STATE note): anything hot marks a
// dirty flag; one timer writes the record(s) FLUSH_MS after the last change,
// and deinit() flushes synchronously. Definitions follow the playback state.
static void state_dirty(void);
static void index_dirty(void);
static void bov_dirty(void);
static void ensure_loaded(void);
static uint32_t s_builtin_ov[BUILTIN_OV_MAX];  // per-built-in packed overrides
// Where the on-screen streamed image lives on flash, kept in the boot record so
// launch can decode it with ONE record lookup plus the image's own records —
// before the slot index, the selection or anything else is read.
static int s_active_slot = -1;
static uint32_t s_active_len, s_active_hash;
// Index record buffers, static: 480 bytes is too much for the app stack.
static uint32_t s_idx_ids[SLOT_COUNT], s_idx_flags[SLOT_COUNT];
static uint16_t s_idx_lens[SLOT_COUNT];

// The image on screen, by id (0 = unnamed). Persisted, so a relaunch goes
// straight to its slot instead of guessing.
static uint32_t s_active_id;
// Requested image and displayed cursor are deliberately separate. A busy send
// cannot consume a photo, and an obsolete response cannot change the screen.
static uint32_t s_desired_id;
static int s_requested_idx = -1;
static AppTimer *s_request_timer;
static AppTimer *s_request_expiry;
static bool s_phone_selection, s_legacy_phone;
static int s_request_tries;
static void cancel_request(void);
static bool request_idx(int idx);
static void handshake_reply(void *data);
static void handshake_reply_now(void);
// True while the face is holding the blank backdrop because the image it
// should be showing is neither bundled nor cached. The phone asks about this
// in the handshake (NEED_IMAGE) and streams that one image.
static bool s_need_image;

// The phone's ordered selection: the ids, plus one byte of structure each
// (bits 0..6 group index, bit 7 = this group loops at its end) and the cursor.
// This is what the watch plays from — without it (old JS, or before the first
// push) it asks the phone for every advance and cycles the built-ins offline.
#define SEL_MAX 64
static uint32_t s_sel[SEL_MAX];
static uint8_t s_sel_grp[SEL_MAX];
static int s_sel_n;
static int s_sel_pos = -1;

// PNG being written to a slot; owned here until the run lands.
static uint8_t *s_cache_buf;
static uint32_t s_cache_len;
static uint32_t s_cache_written;
static uint32_t s_cache_id;
static uint32_t s_cache_flags;  // the image's packed overrides, into the header
static int s_cache_slot = -1;
static bool s_cache_ack;       // the phone is waiting for CACHE_ACK (prefetch)
static AppTimer *s_cache_timer;
// Foreground cache reads own the PNG buffer until completion/cancellation.
static uint8_t *s_read_buf;
static AppTimer *s_read_timer;
static int s_read_slot = -1, s_read_idx = -1;
static uint32_t s_read_id, s_read_len, s_read_hash, s_read_off, s_read_flags;
static uint32_t s_read_started, s_read_header_ms, s_read_io_ms;
static bool s_read_header, s_read_ack, s_read_override;
static void cache_read_cancel(void);
static void cache_read_complete(bool ok, uint32_t id, uint32_t flags, int idx, bool ack);


static bool img_slot_available(void) {
  // persist_get_max_size() is a syscall; only call it on firmware that has
  // it, or the app faults on launch.
  WatchInfoVersion v = watch_info_get_firmware_version();
  bool has_call = v.major > 4 || (v.major == 4 && (v.minor > 9 || (v.minor == 9 && v.patch >= 171)));
  return has_call && persist_get_max_size() >= IMG_CACHE_MIN_QUOTA;
}

static uint32_t img_hash(const uint8_t *p, uint32_t n) {
  uint32_t h = 2166136261u;  // FNV-1a
  for (uint32_t i = 0; i < n; i++) { h ^= p[i]; h *= 16777619u; }
  return h;
}

// One-line answers to the phone (CACHE_ACK / CACHE_MISS / CACHE_FULL): all
// three are just an id, so they share a choke point.
static void reply_id(uint32_t key, uint32_t id) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) { return; }
  dict_write_int32(out, key, (int32_t)id);
  app_message_outbox_send();
}

// Allocation ledger is write-ahead: reserve records BEFORE writing PNG bytes.
// Header validity and allocated quota are different things. Interrupted writes
// and evicted images retain their reservation until background deletion lands.
#define PERSIST_KEY_CACHE_ALLOC 76
#define CACHE_ALLOC_VERSION 1
#define CACHE_ALL_SLOTS (((uint64_t)1 << SLOT_COUNT) - 1)
typedef struct {
  uint32_t version;
  uint16_t records[SLOT_COUNT];
  uint64_t known;
} CacheAllocation;
static CacheAllocation s_alloc, s_alloc_saved;
// Leave startup/navigation time free of repair. Slow storage earns a longer
// idle gap; timer slicing alone does not make a synchronous syscall cheap.
#define CACHE_GC_START_MS 10000
#define CACHE_GC_IDLE_MS 250
static uint32_t cache_clock_ms(void) {
  time_t sec; uint16_t ms; time_ms(&sec, &ms);
  return (uint32_t)sec * 1000u + ms;
}
static uint64_t s_gc_pending;
static AppTimer *s_gc_timer;
static int s_gc_slot = -1, s_gc_phase, s_gc_low, s_gc_high, s_gc_keep;
static bool s_alloc_ready, s_gc_index_changed;
static int s_gc_save_failures;
static void cache_gc_tick(void *data);
static bool cache_alloc_save(void) {
  if (memcmp(&s_alloc, &s_alloc_saved, sizeof(s_alloc)) == 0) { return true; }
  if (persist_write_data(PERSIST_KEY_CACHE_ALLOC, &s_alloc, sizeof(s_alloc)) != (int)sizeof(s_alloc)) { return false; }
  s_alloc_saved = s_alloc;
  return true;
}
static void cache_gc_schedule(int slot) {
  if (!s_slot_ready || slot < 0 || slot >= SLOT_COUNT) { return; }
  s_gc_pending |= (uint64_t)1 << slot;
  if (s_gc_slot == slot) { s_gc_phase = 0; }
  if (!s_gc_timer) { s_gc_timer = app_timer_register(CACHE_GC_IDLE_MS, cache_gc_tick, NULL); }
}
static void cache_alloc_init(void) {
  if (!s_slot_ready) { return; }
  memset(&s_alloc_saved, 0, sizeof(s_alloc_saved));
  if (persist_read_data(PERSIST_KEY_CACHE_ALLOC, &s_alloc, sizeof(s_alloc)) != (int)sizeof(s_alloc)
      || s_alloc.version != CACHE_ALLOC_VERSION) {
    memset(&s_alloc, 0, sizeof(s_alloc));
    s_alloc.version = CACHE_ALLOC_VERSION;
  } else { s_alloc_saved = s_alloc; }
  s_slot_used = 0;
  for (int s = 0; s < SLOT_COUNT; s++) {
    if (s_alloc.records[s] > MAX_IMAGE_BYTES / IMG_CACHE_REC) {
      s_alloc.records[s] = 0; s_alloc.known &= ~((uint64_t)1 << s);
    }
    s_slot_used += (uint32_t)s_alloc.records[s] * IMG_CACHE_REC;
  }
  s_alloc_ready = (s_alloc.known & CACHE_ALL_SLOTS) == CACHE_ALL_SLOTS;
  s_gc_pending = CACHE_ALL_SLOTS & ~s_alloc.known;
  for (int s = 0; s < SLOT_COUNT; s++) {
    // A known empty slot cannot contain an interrupted write: reservation
    // must reach flash before any data is written. Allocated slots still
    // reconcile their headers, including commits newer than the index.
    if (s_alloc.records[s] || s_slot[s].len) { s_gc_pending |= (uint64_t)1 << s; }
  }
  if (s_gc_pending) { s_gc_timer = app_timer_register(CACHE_GC_START_MS, cache_gc_tick, NULL); }
  else if (s_gc_index_changed) { index_dirty(); s_gc_index_changed = false; }
}

// One storage operation per tick. Batch the repair ledger commit at the end;
// interrupted discovery simply resumes from the previous durable reservation.
// Legacy runs are contiguous: old writers never deleted data keys, and this
// collector deletes from the end. Binary search finds their high-water mark
// in at most eight probes instead of scanning 6,144 possibly-absent keys.
static void cache_gc_tick(void *data) {
  s_gc_timer = NULL;
  uint32_t started = cache_clock_ms();
  if (s_cache_slot >= 0 || s_read_buf) {
    s_gc_timer = app_timer_register(CACHE_GC_IDLE_MS, cache_gc_tick, NULL);
    return;
  }
  if (s_gc_slot < 0) {
    for (int s = 0; s < SLOT_COUNT; s++) {
      if ((s_gc_pending & ((uint64_t)1 << s)) && s != s_cache_slot) { s_gc_slot = s; break; }
    }
    if (s_gc_slot < 0) {
      if (s_gc_pending) { s_gc_timer = app_timer_register(CACHE_GC_IDLE_MS, cache_gc_tick, NULL); }
      return;
    }
    s_gc_phase = 0;
  }
  int slot = s_gc_slot;
  if (s_gc_phase == 0) {
    ImgSlotHdr h = {0};
    bool valid = persist_read_data(SLOT_HDR_KEY(slot), &h, sizeof(h)) == (int)sizeof(h)
                 && h.len > 0 && h.len <= MAX_IMAGE_BYTES;
    // Headers commit before the index; recover a completed write after a crash.
    uint32_t id = valid ? h.id : ID_NONE, len = valid ? h.len : 0, flags = valid ? h.flags : 0;
    if (s_slot[slot].id != id || s_slot[slot].len != len || s_slot[slot].flags != flags) {
      s_slot[slot].id = id; s_slot[slot].len = len; s_slot[slot].flags = flags;
      s_gc_index_changed = true;
    }
    s_gc_keep = valid ? (h.len + IMG_CACHE_REC - 1) / IMG_CACHE_REC : 0;
    if (!(s_alloc.known & ((uint64_t)1 << slot))) {
      s_gc_low = 0; s_gc_high = MAX_IMAGE_BYTES / IMG_CACHE_REC;
      s_gc_phase = 3;
    } else { s_gc_phase = 2; }
  } else if (s_gc_phase == 3) {
    // Most slots are empty; one probe avoids seven unsuccessful lookups.
    if (persist_get_size(SLOT_DATA_KEY(slot)) <= 0) { s_gc_high = 0; }
    else { s_gc_low = 1; }
    s_gc_phase = 1;
  } else if (s_gc_phase == 1) {
    if (s_gc_low < s_gc_high) {
      int mid = (s_gc_low + s_gc_high) / 2;
      if (persist_get_size(SLOT_DATA_KEY(slot) + mid) > 0) { s_gc_low = mid + 1; }
      else { s_gc_high = mid; }
    } else {
      s_slot_used -= (uint32_t)s_alloc.records[slot] * IMG_CACHE_REC;
      s_alloc.records[slot] = s_gc_low;
      s_slot_used += (uint32_t)s_alloc.records[slot] * IMG_CACHE_REC;
      s_alloc.known |= (uint64_t)1 << slot;
      s_gc_phase = 2;
    }
  } else if (s_alloc.records[slot] > s_gc_keep) {
    int key = SLOT_DATA_KEY(slot) + s_alloc.records[slot] - 1;
    status_t rc = persist_delete(key);
    if (rc == S_TRUE || rc == E_DOES_NOT_EXIST) {
      s_alloc.records[slot]--;
      s_slot_used -= IMG_CACHE_REC;
    } else {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Cache cleanup failed at key %d (%d)", key, (int)rc);
      // Keep the reservation; retry on the next launch instead of a busy loop.
      s_gc_pending &= ~((uint64_t)1 << slot); s_gc_slot = -1;
    }
  } else if ((s_gc_pending & ~((uint64_t)1 << slot)) || cache_alloc_save()) {
    s_gc_save_failures = 0;
    s_gc_pending &= ~((uint64_t)1 << slot);
    s_gc_slot = -1;
    if (!s_gc_pending) { s_alloc_ready = (s_alloc.known & CACHE_ALL_SLOTS) == CACHE_ALL_SLOTS; }
  } else {
    APP_LOG(APP_LOG_LEVEL_WARNING, "Cache allocation journal could not be saved");
    if (++s_gc_save_failures < 3) { s_gc_timer = app_timer_register(5000, cache_gc_tick, NULL); }
    return;
  }
  if (s_gc_pending) {
    uint32_t elapsed = cache_clock_ms() - started;
    uint32_t delay = elapsed > 5000 ? 20000 : elapsed * 4;
    if (delay < CACHE_GC_IDLE_MS) { delay = CACHE_GC_IDLE_MS; }
    s_gc_timer = app_timer_register(delay, cache_gc_tick, NULL);
  }
  else {
    if (s_gc_index_changed) { index_dirty(); s_gc_index_changed = false; }
    if (connection_service_peek_pebble_app_connection()) {
    // Repair can outlast the phone's bounded prefetch retries. Advertise the
    // newly available capacity once maintenance finishes.
      handshake_reply_now();
    }
  }
}

// A missing index is recovered by the paced header collector, never by a
// synchronous 48-slot scan during startup. The boot record can independently
// restore the on-screen image while recovery runs.
static void img_slot_scan(void) {
  s_slot_used = 0;
  s_slot_ready = img_slot_available();
  memset(s_slot, 0, sizeof(s_slot));
  if (s_slot_ready) { s_gc_index_changed = true; }
  APP_LOG(APP_LOG_LEVEL_INFO, "Image cache index will recover in background");
}

// Normal launch: three index records instead of 48 headers. The index can be
// behind the headers by one debounce window (a crash between the two), so every
// use of a slot still checks its header (img_slot_show) and drops a liar.
static void img_slot_load_index(void) {
  s_slot_used = 0;
  s_slot_ready = img_slot_available();
  if (!s_slot_ready) {
    APP_LOG(APP_LOG_LEVEL_INFO, "Image cache off (firmware has no 1 MiB persist quota)");
    return;
  }
  uint32_t *ids = s_idx_ids, *flags = s_idx_flags;
  uint16_t *lens = s_idx_lens;
  int a = persist_read_data(PERSIST_KEY_IDX_IDS, ids, sizeof(s_idx_ids));
  int b = persist_read_data(PERSIST_KEY_IDX_LENS, lens, sizeof(s_idx_lens));
  int c = persist_read_data(PERSIST_KEY_IDX_FLAGS, flags, sizeof(s_idx_flags));
  if (a != (int)sizeof(s_idx_ids) || b != (int)sizeof(s_idx_lens) || c != (int)sizeof(s_idx_flags)) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "Slot index unreadable (%d/%d/%d), rescanning headers", a, b, c);
    img_slot_scan();
    return;
  }
  int valid = 0;
  for (int s = 0; s < SLOT_COUNT; s++) {
    if (lens[s] == 0 || lens[s] > MAX_IMAGE_BYTES) { continue; }
    s_slot[s].id = ids[s];
    s_slot[s].len = lens[s];
    s_slot[s].flags = flags[s];
    s_slot_used += lens[s];
    valid++;
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "Image cache (index): %d/%d slots valid, %u bytes used of %u",
          valid, SLOT_COUNT, (unsigned int)s_slot_used, (unsigned int)persist_get_max_size());
}

static int img_slot_find(uint32_t id) {
  for (int s = 0; s < SLOT_COUNT; s++) {
    if (s_slot[s].len && s_slot[s].id == id) { return s; }
  }
  return -1;
}

// Invalidate first; background collection releases the allocated records.
static void img_slot_free(int slot) {
  if (slot < 0 || slot >= SLOT_COUNT) { return; }
  ImgSlotHdr h = { 0, 0, 0, 0 };
  if (persist_write_data(SLOT_HDR_KEY(slot), &h, sizeof(h)) != (int)sizeof(h)) { return; }
  s_slot[slot].len = 0; s_slot[slot].id = ID_NONE; s_slot[slot].flags = 0;
  // No quota credit here. Only successful deletion releases allocated records.
  index_dirty();
  cache_gc_schedule(slot);
}

static void img_slot_abort_write(void) {
  if (s_cache_timer) { app_timer_cancel(s_cache_timer); s_cache_timer = NULL; }
  if (s_cache_slot >= 0 && !s_slot[s_cache_slot].len) { cache_gc_schedule(s_cache_slot); }
  if (s_cache_buf) { free(s_cache_buf); s_cache_buf = NULL; }
  s_cache_len = s_cache_written = 0;
  s_cache_flags = 0;
  s_cache_slot = -1;
  s_cache_ack = false;
}

// Reserve a fully reclaimed slot. Existing committed IDs are reused without writing. An unnamed legacy transfer (id 0) is just another id
// here — it reuses the slot already holding id 0 and otherwise takes the first
// free one, so it never evicts a named image. -1 = the slot table or the quota
// is full; the caller answers CACHE_FULL.
static int img_slot_reserve(uint32_t id, uint32_t len) {
  if (!s_alloc_ready) { return -1; }  // legacy allocation discovery is still running
  int slot = -1;
  for (int i = 0; i < SLOT_COUNT; i++) {
    if (!s_slot[i].len && !s_alloc.records[i] && !(s_gc_pending & ((uint64_t)1 << i))) { slot = i; break; }
  }
  if (slot < 0) { return -1; }
  uint16_t records = (len + IMG_CACHE_REC - 1) / IMG_CACHE_REC;
  uint32_t bytes = (uint32_t)records * IMG_CACHE_REC;
  if (s_slot_used + bytes + IMG_CACHE_HEADROOM > persist_get_max_size()) { return -1; }
  ImgSlotHdr h = {0};
  if (persist_write_data(SLOT_HDR_KEY(slot), &h, sizeof(h)) != (int)sizeof(h)) { return -1; }
  s_alloc.records[slot] = records;
  if (!cache_alloc_save()) { s_alloc.records[slot] = 0; return -1; }
  s_slot_used += bytes;
  return slot;
}

static void img_slot_write_tick(void *data) {
  s_cache_timer = NULL;
  int slot = s_cache_slot;
  for (int i = 0; i < IMG_CACHE_RECS_PER_TICK && s_cache_written < s_cache_len; i++) {
    uint32_t n = s_cache_len - s_cache_written;
    if (n > IMG_CACHE_REC) { n = IMG_CACHE_REC; }
    int rc = persist_write_data(SLOT_DATA_KEY(slot) + s_cache_written / IMG_CACHE_REC,
                                s_cache_buf + s_cache_written, n);
    if (rc != (int)n) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Slot %d write failed (%d) at %u bytes",
              slot, rc, (unsigned int)s_cache_written);
      bool ack = s_cache_ack;
      uint32_t id = s_cache_id;
      img_slot_abort_write();
      if (ack) { reply_id(MESSAGE_KEY_CACHE_FULL, id); }
      return;
    }
    s_cache_written += n;
  }
  if (s_cache_written < s_cache_len) {
    s_cache_timer = app_timer_register(30, img_slot_write_tick, NULL);
    return;
  }
  ImgSlotHdr h = { s_cache_len, img_hash(s_cache_buf, s_cache_len), s_cache_id, s_cache_flags };
  bool committed = persist_write_data(SLOT_HDR_KEY(slot), &h, sizeof(h)) == (int)sizeof(h);
  if (committed) {
    s_slot[slot].id = s_cache_id;
    s_slot[slot].len = s_cache_len;
    s_slot[slot].flags = s_cache_flags;
    index_dirty();
    if (s_cache_id == s_active_id) {
      s_active_slot = slot; s_active_len = s_cache_len; s_active_hash = h.hash;
      state_dirty();
    }
    APP_LOG(APP_LOG_LEVEL_INFO, "Cached id=%08x in slot %d (%u bytes; %u of %u used)",
            (unsigned int)s_cache_id, slot, (unsigned int)s_cache_len,
            (unsigned int)s_slot_used, (unsigned int)persist_get_max_size());
  }
  bool ack = s_cache_ack;
  uint32_t id = s_cache_id;
  img_slot_abort_write();  // just frees the buffer here
  if (ack) { reply_id(committed ? MESSAGE_KEY_CACHE_ACK : MESSAGE_KEY_CACHE_FULL, id); }
}

// Takes ownership of png (freed when done) and persists it into `id`'s slot in
// the background, a few records per timer tick, so the face keeps drawing.
// ack = the phone is blocked on CACHE_ACK before it sends the next prefetch.
// ov = the image's packed per-image overrides, stored in the slot header so a
// later local show applies the right look without asking the phone.
static void img_slot_begin_write(uint8_t *png, uint32_t len, uint32_t id, bool ack, uint32_t ov) {
  img_slot_abort_write();
  if (len == 0 || len > MAX_IMAGE_BYTES || !s_slot_ready) { free(png); return; }
  // Image IDs are immutable. An existing committed copy needs no rewrite.
  int old_slot = img_slot_find(id);
  if (id != ID_NONE && old_slot >= 0) { free(png); if (ack) { reply_id(MESSAGE_KEY_CACHE_ACK, id); } return; }
  if (old_slot >= 0) {
    img_slot_free(old_slot);  // legacy ID zero names different bytes each time
    if (s_slot[old_slot].len) { free(png); if (ack) { reply_id(MESSAGE_KEY_CACHE_FULL, id); } return; }
    s_active_slot = -1; state_dirty();
  }
  int slot = img_slot_reserve(id, len);
  if (slot < 0) {
    free(png);
    if (ack) { reply_id(MESSAGE_KEY_CACHE_FULL, id); }
    return;
  }
  s_cache_buf = png;
  s_cache_len = len;
  s_cache_written = 0;
  s_cache_id = id;
  s_cache_flags = ov;
  s_cache_slot = slot;
  s_cache_ack = ack;
  s_cache_timer = app_timer_register(200, img_slot_write_tick, NULL);
}

// Read `len` bytes cooperatively. No storage call happens in the caller's
// shake/launch callback; each timer performs at most one 256-byte read. The
// old bitmap remains visible until the separate decoder callback.
static void cache_read_cancel(void) {
  if (s_read_timer) { app_timer_cancel(s_read_timer); s_read_timer = NULL; }
  free(s_read_buf); s_read_buf = NULL;
  s_read_slot = s_read_idx = -1;
  s_read_ack = s_read_override = false;
}

static void cache_read_fail(bool corrupt) {
  int slot = s_read_slot, idx = s_read_idx;
  uint32_t id = s_read_id, flags = s_read_flags;
  bool ack = s_read_ack;
  cache_read_cancel();
  if (corrupt) { img_slot_free(slot); }
  cache_read_complete(false, id, flags, idx, ack);
}

static void cache_read_tick(void *data) {
  s_read_timer = NULL;
  if (!s_read_buf) { return; }
  if (s_desired_id != s_read_id) { cache_read_cancel(); return; }
  uint32_t start = cache_clock_ms();
  if (s_read_header) {
    ImgSlotHdr h;
    int n = persist_read_data(SLOT_HDR_KEY(s_read_slot), &h, sizeof(h));
    s_read_header_ms = cache_clock_ms() - start;
    if (n != (int)sizeof(h) || h.id != s_read_id || h.len != s_read_len) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Cached image header changed");
      cache_read_fail(true); return;
    }
    s_read_hash = h.hash;
    if (!s_read_override) { s_read_flags = h.flags; }
    s_read_header = false;
  } else if (s_read_off < s_read_len) {
    uint32_t n = s_read_len - s_read_off;
    if (n > IMG_CACHE_REC) { n = IMG_CACHE_REC; }
    int got = persist_read_data(SLOT_DATA_KEY(s_read_slot) + s_read_off / IMG_CACHE_REC,
                                s_read_buf + s_read_off, n);
    s_read_io_ms += cache_clock_ms() - start;
    if (got != (int)n) { cache_read_fail(true); return; }
    s_read_off += n;
  } else {
    if (img_hash(s_read_buf, s_read_len) != s_read_hash) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Cached image hash mismatch");
      cache_read_fail(true); return;
    }
    bitmap_layer_set_bitmap(s_image_layer, NULL);
    if (s_bitmap) { gbitmap_destroy(s_bitmap); s_bitmap = NULL; }
    uint32_t decode_start = cache_clock_ms();
    GBitmap *decoded = gbitmap_create_from_png_data(s_read_buf, s_read_len);
    uint32_t decode_ms = cache_clock_ms() - decode_start;
    APP_LOG(APP_LOG_LEVEL_INFO, "Cache timing: header=%ums read=%ums decode=%ums total=%ums (%u bytes)",
            (unsigned int)s_read_header_ms, (unsigned int)s_read_io_ms,
            (unsigned int)decode_ms, (unsigned int)(cache_clock_ms() - s_read_started),
            (unsigned int)s_read_len);
    if (!decoded) { cache_read_fail(false); return; }
    int slot = s_read_slot, idx = s_read_idx;
    uint32_t id = s_read_id, len = s_read_len, hash = s_read_hash, flags = s_read_flags;
    bool ack = s_read_ack;
    cache_read_cancel();
    s_bitmap = decoded;
    bitmap_layer_set_bitmap(s_image_layer, s_bitmap);
    layer_mark_dirty(bitmap_layer_get_layer(s_image_layer));
    cache_read_complete(true, id, flags, idx, ack);
    s_active_slot = slot; s_active_len = len; s_active_hash = hash;
    state_dirty();
    return;
  }
  // Small but nonzero yield lets navigation/AppMessage/paint run between reads.
  s_read_timer = app_timer_register(1, cache_read_tick, NULL);
  if (!s_read_timer) { cache_read_fail(false); }
}

static bool cache_read_start(int slot, uint32_t id, uint32_t len, uint32_t hash,
                             uint32_t flags, bool header) {
  cache_read_cancel();
  if (slot < 0 || slot >= SLOT_COUNT || !len || len > MAX_IMAGE_BYTES) { return false; }
  s_read_buf = malloc(len);
  if (!s_read_buf) { return false; }
  s_read_slot = slot; s_read_id = id; s_read_len = len; s_read_hash = hash;
  s_read_flags = flags; s_read_header = header; s_read_off = 0;
  s_read_started = cache_clock_ms(); s_read_header_ms = s_read_io_ms = 0;
  s_desired_id = id;
  s_read_timer = app_timer_register(1, cache_read_tick, NULL);
  if (!s_read_timer) { cache_read_cancel(); return false; }
  return true;
}

// True means a cached display was accepted, not that it is already on screen.
static bool img_slot_show(uint32_t id) {
  if (!s_slot_ready) { return false; }
  ensure_loaded();
  int slot = img_slot_find(id);
  return slot >= 0 && cache_read_start(slot, id, s_slot[slot].len, 0, s_slot[slot].flags, true);
}

// Remember what's on screen. PERSIST_KEY_ACTIVE_ID drives the launch path;
// PERSIST_KEY_LAST_STREAMED is still written so a downgrade to 1.0.x behaves.
static void set_active_id(uint32_t id, bool streamed) {
  uint32_t prev = s_active_id;
  s_active_id = id;
  s_desired_id = id;
  cancel_request();
  s_need_image = false;  // something is on screen now
  s_last_streamed = streamed;
  if (!streamed || img_slot_find(id) < 0) { s_active_slot = -1; }  // a stream lands on flash later
  state_dirty();
  // SEL_IDS spares the on-screen image's slot even when the image drops out of
  // the selection, and nothing revisits it — so collect it here, the moment
  // something else is on screen. Without this the slot leaks until the next
  // SEL_IDS lands.
  if (prev != id && prev != ID_NONE && s_sel_n > 0) {
    bool selected = false;
    for (int i = 0; i < s_sel_n; i++) { if (s_sel[i] == prev) { selected = true; break; } }
    int slot = selected ? -1 : img_slot_find(prev);
    if (slot >= 0) {
      APP_LOG(APP_LOG_LEVEL_INFO, "Freeing slot %d: %08x left the screen and the selection",
              slot, (unsigned int)prev);
      img_slot_free(slot);
    }
  }
}

// An answer from the phone (built-in index or completed transfer) landed:
// cancel the offline fallback.
static void cancel_fallback(void) {
  if (s_fallback_timer) {
    app_timer_cancel(s_fallback_timer);
    s_fallback_timer = NULL;
  }
}

// Show a CACHED image; single choke point for cache hits (launch, IMG_SHOW,
// offline advance). Everything that changes what's on screen also settles the
// fallback timer, the spinner and the active id.
static bool show_slot(uint32_t id) {
  cache_read_cancel();
  img_transfer_reset();
  img_slot_abort_write();
  if (!img_slot_show(id)) { return false; }
  cancel_fallback();
  return true;  // completion settles spinner, active id and cursor
}

// Show a bundled built-in straight from flash; single choke point for
// built-in changes (launch restore, phone reply, offline fallback).
static void show_builtin(int index) {
  cache_read_cancel();
  if (index < 0 || index >= (int)BUILTIN_COUNT) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "Built-in index %d out of range (0..%d)",
            index, (int)BUILTIN_COUNT - 1);
    return;
  }

  cancel_fallback();
  img_transfer_reset();  // a built-in supersedes any in-flight transfer
  // ...and, being a DISPLAY request, it also stops a prefetch mid-write: the
  // slot header stays zero and the phone's next round retries it. The cached
  // images themselves survive — only 1.0.12 wiped the cache for a built-in.
  img_slot_abort_write();

  // Detach before freeing so old and new bitmaps never both peak on the heap.
  bitmap_layer_set_bitmap(s_image_layer, NULL);
  if (s_bitmap) {
    gbitmap_destroy(s_bitmap);
    s_bitmap = NULL;
  }

  s_bitmap = gbitmap_create_with_resource(s_builtin_resources[index]);
  if (!s_bitmap) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Built-in %d failed to load", index);
    return;
  }
  bitmap_layer_set_bitmap(s_image_layer, s_bitmap);
  layer_mark_dirty(bitmap_layer_get_layer(s_image_layer));

  APP_LOG(APP_LOG_LEVEL_INFO, "Showing built-in %d/%d from flash", index + 1, (int)BUILTIN_COUNT);
  set_loading(false);

  s_current_image = index;
  state_dirty();
  set_active_id(ID_BUILTIN(index), false);
}
