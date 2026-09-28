// GENERATED from src/shared/image-face/face-events.h. Do not edit this copy.
// Shared Photo Face / franchise engine. Included by face-engine.h in dependency order.
// --- Events --------------------------------------------------------------

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  update_time();
  if (!(units_changed & MINUTE_UNIT)) { return; }  // second ticks redraw the clock only
  update_info();  // date flips at midnight; steps/battery drift — cheap to refresh
  if (s_set.rotate_min > 0 && ++s_minutes_since_rotate >= s_set.rotate_min) {
    advance_photo(false);
  }
}

// Seconds are opt-in: the face only pays for per-second wakeups while the
// clock actually shows them.
static void resubscribe_ticks(void) {
  tick_timer_service_subscribe(s_set.seconds ? SECOND_UNIT : MINUTE_UNIT, tick_handler);
}

static void battery_handler(BatteryChargeState state) { update_info(); }

static void app_connection_handler(bool connected) {
  update_info();
  if (!connected) {
    s_phone_selection = s_legacy_phone = false;
    cancel_request();
  } else if (s_need_image && s_sel_n > 0) {
    request_idx(s_sel_pos >= 0 ? s_sel_pos : 0);
  }
}

static bool s_had_shake;
static uint32_t s_last_shake_ms;
static void accel_tap_handler(AccelAxisType axis, int32_t direction) {
  time_t sec; uint16_t ms; time_ms(&sec, &ms);
  uint32_t now = (uint32_t)sec * 1000u + ms;
  if (s_had_shake && now - s_last_shake_ms < 900) { return; }
  if (s_set.shake) {
    s_had_shake = true; s_last_shake_ms = now;
    APP_LOG(APP_LOG_LEVEL_INFO, "Shake -> next image");
    schedule_flush();  // restart the idle window even for a coalesced gesture
    advance_photo(true);
  }
}

// Settings ride in the boot record (see PERSIST_KEY_STATE); the per-key
// legacy records are only ever written by the first-run migration.
static void save_settings(void) { s_settings_dirty = true; state_dirty(); }

// Clamp settings read back from storage or the wire. Builds 1.0.3/1.0.4
// shifted the messageKey numeric IDs (keys were inserted mid-list; they are
// an append-only ABI between the phone-side JS and this binary, which can
// transiently run different versions), so a neighbouring setting's value
// could land here. Out-of-range junk heals to defaults instead of sticking.
static void sanitize_settings(void) {
  if (s_set.rotate_min < 0 || s_set.rotate_min > 24 * 60) { s_set.rotate_min = 30; }
  if (s_set.clock_pos < 0 || s_set.clock_pos > 2) { s_set.clock_pos = 2; }
  if (s_set.time_fmt < 0 || s_set.time_fmt > 2) { s_set.time_fmt = 0; }
  if (s_set.seconds < 0 || s_set.seconds > 1) { s_set.seconds = 0; }
  if (s_set.font_all < 0 || s_set.font_all > 1) { s_set.font_all = 1; }
  if (s_set.font_size < 0 || s_set.font_size >= SIZE_COUNT) { s_set.font_size = 1; }
  if (s_set.font < 0 || s_set.font >= STYLE_COUNT) { s_set.font = 0; }
  if (s_set.color < 0 || s_set.color > 1) { s_set.color = 0; }
  if (s_set.ink_hex < -1 || s_set.ink_hex > 0xffffff) { s_set.ink_hex = -1; }
  if (s_set.bar_hex < -1 || s_set.bar_hex > 0xffffff) { s_set.bar_hex = -1; }
  if (s_set.bg < 0 || s_set.bg > 2) { s_set.bg = 0; }
  for (int dp = 0; dp < DP_COUNT; dp++) {
    int v = s_set.dp_pos[dp];
    if (v != 0 && (v < 0 || DP_CELL(v) < 1 || DP_SEQ(v) >= DP_COUNT)) {
      s_set.dp_pos[dp] = 0;
    }
  }
}

// fresh = the store has no SCHEMA record yet: probe each key (slow, once).
// Otherwise every key is known to exist and is read outright — no probes.
static void load_settings(bool fresh) {
  if (!fresh || persist_exists(PERSIST_KEY_ROTATE_MIN)) { s_set.rotate_min = persist_read_int(PERSIST_KEY_ROTATE_MIN); }
  if (!fresh || persist_exists(PERSIST_KEY_SHAKE)) { s_set.shake = persist_read_bool(PERSIST_KEY_SHAKE); }
  if (!fresh || persist_exists(PERSIST_KEY_SHUFFLE)) { s_set.shuffle = persist_read_bool(PERSIST_KEY_SHUFFLE); }
  if (!fresh || persist_exists(PERSIST_KEY_CLOCK_POS)) { s_set.clock_pos = persist_read_int(PERSIST_KEY_CLOCK_POS); }
  if (!fresh || persist_exists(PERSIST_KEY_TIME_FMT)) { s_set.time_fmt = persist_read_int(PERSIST_KEY_TIME_FMT); }
  if (!fresh || persist_exists(PERSIST_KEY_SECONDS)) { s_set.seconds = persist_read_int(PERSIST_KEY_SECONDS); }
  if (!fresh || persist_exists(PERSIST_KEY_FONT_ALL)) { s_set.font_all = persist_read_int(PERSIST_KEY_FONT_ALL); }
  if (!fresh || persist_exists(PERSIST_KEY_FONT_SIZE)) { s_set.font_size = persist_read_int(PERSIST_KEY_FONT_SIZE); }
  if (!fresh || persist_exists(PERSIST_KEY_FONT)) { s_set.font = persist_read_int(PERSIST_KEY_FONT); }
  if (!fresh || persist_exists(PERSIST_KEY_COLOR)) { s_set.color = persist_read_int(PERSIST_KEY_COLOR); }
  if (!fresh || persist_exists(PERSIST_KEY_INK_HEX)) { s_set.ink_hex = persist_read_int(PERSIST_KEY_INK_HEX); }
  if (!fresh || persist_exists(PERSIST_KEY_OV_BASE)) {
    s_ov_pos = persist_read_int(PERSIST_KEY_OV_BASE + 0);
    s_ov_ink = persist_read_int(PERSIST_KEY_OV_BASE + 1);
    s_ov_bg = persist_read_int(PERSIST_KEY_OV_BASE + 2);
    s_ov_bar = persist_read_int(PERSIST_KEY_OV_BASE + 3);
  }
  if (!fresh || persist_exists(PERSIST_KEY_BAR_HEX)) { s_set.bar_hex = persist_read_int(PERSIST_KEY_BAR_HEX); }
  if (!fresh || persist_exists(PERSIST_KEY_BG)) { s_set.bg = persist_read_int(PERSIST_KEY_BG); }

  if (!fresh || persist_exists(PERSIST_KEY_DP_BASE)) {
    for (int dp = 0; dp < DP_COUNT; dp++) {
      if (!fresh || persist_exists(PERSIST_KEY_DP_BASE + dp)) {
        s_set.dp_pos[dp] = persist_read_int(PERSIST_KEY_DP_BASE + dp);
      }
    }
  } else if (fresh && persist_exists(PERSIST_KEY_OLD_SHOW_DATE)) {
    // One-time migration from the toggle era: every enabled data point lands in
    // the cell under the clock, in the old fixed order — which is exactly the
    // layout those settings produced.
    static const int old_keys[DP_COUNT] = {
      [DP_DATE] = PERSIST_KEY_OLD_SHOW_DATE, [DP_BATT] = PERSIST_KEY_OLD_SHOW_BATT,
      [DP_STEPS] = PERSIST_KEY_OLD_SHOW_STEPS, [DP_TEMP] = PERSIST_KEY_OLD_SHOW_TEMP,
      [DP_HR] = PERSIST_KEY_OLD_SHOW_HR,
    };
    int under = s_set.clock_pos * 3 + 2, seq = 0;
    for (int dp = 0; dp < DP_COUNT; dp++) {
      s_set.dp_pos[dp] = 0;
      if (persist_exists(old_keys[dp]) && persist_read_bool(old_keys[dp])) {
        s_set.dp_pos[dp] = seq++ * 10 + under;
      }
    }
  }

  if (!fresh || persist_exists(PERSIST_KEY_TEMP_SET)) {
    s_temp_known = persist_read_bool(PERSIST_KEY_TEMP_SET);
    s_temp_val = persist_read_int(PERSIST_KEY_TEMP_VAL);
  }

  sanitize_settings();
}

static bool display_message_is_current(DictionaryIterator *iter) {
  Tuple *foreground = dict_find(iter, MESSAGE_KEY_IMG_TOTAL);
  Tuple *show = dict_find(iter, MESSAGE_KEY_IMG_SHOW);
  Tuple *builtin_msg = dict_find(iter, MESSAGE_KEY_IMG_BUILTIN);
  if ((foreground || show || builtin_msg) && !dict_find(iter, MESSAGE_KEY_IMG_PREFETCH) && s_phone_selection) {
    Tuple *id_tuple = dict_find(iter, MESSAGE_KEY_IMG_ID);
    uint32_t id = builtin_msg ? ID_BUILTIN(builtin_msg->value->int32)
                 : show ? show->value->uint32 : id_tuple ? id_tuple->value->uint32 : ID_NONE;
    if (id != s_desired_id) {
      APP_LOG(APP_LOG_LEVEL_INFO, "Ignoring obsolete image %08x (wanted %08x)", (unsigned int)id, (unsigned int)s_desired_id);
      return false;
    }
  }
  if ((foreground || show || builtin_msg) && !s_phone_selection) { s_legacy_phone = true; }
  return true;
}

static void inbox_received_handler(DictionaryIterator *iter, void *context) {
  ensure_loaded();
  if (!display_message_is_current(iter)) { return; }
  // Settings (any subset may arrive; the phone sends them all together).
  Settings previous_settings = s_set;
  bool got_settings = false;
  Tuple *t;
  if ((t = dict_find(iter, MESSAGE_KEY_S_ROTATE_MIN))) { s_set.rotate_min = t->value->int32; s_minutes_since_rotate = 0; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_SHAKE))) { s_set.shake = t->value->int32 != 0; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_SHUFFLE))) {
    bool on = t->value->int32 != 0;
    if (on != s_set.shuffle) { s_shown_mask = 0; state_dirty(); }  // a mode change starts a fresh cycle
    s_set.shuffle = on;
    got_settings = true;
  }
  if ((t = dict_find(iter, MESSAGE_KEY_S_CLOCK_POS))) { s_set.clock_pos = t->value->int32; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_TIME_FMT))) { s_set.time_fmt = t->value->int32; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_SECONDS))) { s_set.seconds = t->value->int32; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_FONT_ALL))) { s_set.font_all = t->value->int32; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_FONT_SIZE))) { s_set.font_size = t->value->int32; got_settings = true; }
  // Grid positions, one key per data point (0 = off, else seq*10 + cell).
  {
    // Not static: MESSAGE_KEY_* are extern ints, not compile-time constants.
    const uint32_t pos_keys[DP_COUNT] = {
      [DP_DATE] = MESSAGE_KEY_S_POS_DATE, [DP_BATT] = MESSAGE_KEY_S_POS_BATT,
      [DP_STEPS] = MESSAGE_KEY_S_POS_STEPS, [DP_TEMP] = MESSAGE_KEY_S_POS_TEMP,
      [DP_HR] = MESSAGE_KEY_S_POS_HR, [DP_COND] = MESSAGE_KEY_S_POS_COND,
      [DP_CONN] = MESSAGE_KEY_S_POS_CONN, [DP_SPIN] = MESSAGE_KEY_S_POS_SPIN,
    };
    for (int dp = 0; dp < DP_COUNT; dp++) {
      if ((t = dict_find(iter, pos_keys[dp]))) { s_set.dp_pos[dp] = t->value->int32; got_settings = true; }
    }
  }
#ifdef FACE_LEGACY_TOGGLES
  // Toggle-era compatibility: a cached pre-grid phone JS may still send the
  // old S_SHOW_* keys (they stay in package.json — the key list is an
  // append-only wire ABI). When toggles arrive WITHOUT grid keys, rebuild the
  // grid the way the persist migration does: enabled points stack under the
  // clock in the old fixed order.
  {
    const uint32_t show_keys[] = {
      MESSAGE_KEY_S_SHOW_DATE, MESSAGE_KEY_S_SHOW_BATT, MESSAGE_KEY_S_SHOW_STEPS,
      MESSAGE_KEY_S_SHOW_TEMP, MESSAGE_KEY_S_SHOW_HR,
    };
    const int show_dps[] = { DP_DATE, DP_BATT, DP_STEPS, DP_TEMP, DP_HR };
    bool any_pos = false;
    const uint32_t pos_probe[] = {
      MESSAGE_KEY_S_POS_DATE, MESSAGE_KEY_S_POS_BATT, MESSAGE_KEY_S_POS_STEPS,
      MESSAGE_KEY_S_POS_TEMP, MESSAGE_KEY_S_POS_HR, MESSAGE_KEY_S_POS_COND,
      MESSAGE_KEY_S_POS_CONN, MESSAGE_KEY_S_POS_SPIN,
    };
    for (unsigned i = 0; i < ARRAY_LENGTH(pos_probe); i++) {
      if (dict_find(iter, pos_probe[i])) { any_pos = true; break; }
    }
    bool any_show = false;
    for (unsigned i = 0; i < ARRAY_LENGTH(show_keys); i++) {
      if (dict_find(iter, show_keys[i])) { any_show = true; break; }
    }
    if (any_show && !any_pos) {
      int clock_pos = s_set.clock_pos;
      if ((t = dict_find(iter, MESSAGE_KEY_S_CLOCK_POS))) { clock_pos = t->value->int32; }
      int under = clock_pos * 3 + 2, seq = 0;
      for (unsigned i = 0; i < ARRAY_LENGTH(show_keys); i++) {
        if (!(t = dict_find(iter, show_keys[i]))) { continue; }
        s_set.dp_pos[show_dps[i]] = (t->value->int32 != 0) ? seq++ * 10 + under : 0;
        got_settings = true;
      }
    }
  }
#endif
  if ((t = dict_find(iter, MESSAGE_KEY_S_FONT))) { s_set.font = t->value->int32; got_settings = true; }
  // Per-image overrides. They ride every image message (display push OR
  // prefetch: the watch files them under the image so it can apply them itself
  // later), and OV_SET carries them on their own for an image already here.
  // Applying is the narrow case: a PREFETCH never reaches the screen, and an
  // OV_SET only does when it names the image on it.
  bool is_prefetch = dict_find(iter, MESSAGE_KEY_IMG_PREFETCH) != NULL;
  Tuple *ovset = dict_find(iter, MESSAGE_KEY_OV_SET);
  int ov_pos = -1, ov_ink = -1, ov_bg = -1, ov_bar = -1;
  bool got_ov = false;
  if ((t = dict_find(iter, MESSAGE_KEY_OV_POS))) { ov_pos = t->value->int32; got_ov = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_OV_INK))) { ov_ink = t->value->int32; got_ov = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_OV_BG))) { ov_bg = t->value->int32; got_ov = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_OV_BAR))) { ov_bar = t->value->int32; got_ov = true; }
  if (ov_pos < -1 || ov_pos > 2) { ov_pos = -1; }
  if (ov_bg < -1 || ov_bg > 2) { ov_bg = -1; }
  if (ov_ink < -1 || ov_ink > 0xffffff) { ov_ink = -1; }
  if (ov_bar < -1 || ov_bar > 0xffffff) { ov_bar = -1; }
  uint32_t ov_word = ov_pack(ov_pos, ov_ink, ov_bg, ov_bar);
  if (ovset) {
    // The phone reconciling one image's stored look with its config (it diffs
    // the words the handshake reported). Self-healing, and no phone-side state.
    uint32_t ov_id = ovset->value->uint32;
    ov_store_for(ov_id, ov_word);
    APP_LOG(APP_LOG_LEVEL_INFO, "OV_SET %08x -> %08x%s", (unsigned int)ov_id,
            (unsigned int)ov_word, ov_id == s_active_id ? " (on screen)" : "");
    if (ov_id == s_active_id) { ov_apply(ov_word); }
  } else if (got_ov && !is_prefetch && !dict_find(iter, MESSAGE_KEY_IMG_SHOW)) {
    ov_apply(ov_word);
  }

  if ((t = dict_find(iter, MESSAGE_KEY_S_COLOR))) { s_set.color = t->value->int32; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_INK_COLOR))) { s_set.ink_hex = t->value->int32; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_BAR_COLOR))) { s_set.bar_hex = t->value->int32; got_settings = true; }
  if ((t = dict_find(iter, MESSAGE_KEY_S_BG))) { s_set.bg = t->value->int32; got_settings = true; }
  if (got_settings) {
    sanitize_settings();
    resubscribe_ticks();
    if (memcmp(&previous_settings, &s_set, sizeof(s_set)) != 0) { save_settings(); }
    apply_layout();
    update_time();
    update_info();
    APP_LOG(APP_LOG_LEVEL_INFO, "Settings applied (rotate=%dmin)", s_set.rotate_min);
  }

  // Temperature reading from the phone (already in the configured unit).
  if ((t = dict_find(iter, MESSAGE_KEY_TEMP_NOW))) {
    if (!s_temp_known || s_temp_val != t->value->int32) { state_dirty(); }
    s_temp_val = t->value->int32;
    s_temp_known = true;
    update_info();
  }

  // Weather condition bucket (COND_* enum), sent alongside the temperature.
  if ((t = dict_find(iter, MESSAGE_KEY_COND_NOW))) {
    s_cond_val = t->value->int32;
    update_info();
  }

  // CACHE_QUERY: the phone is about to prefetch and wants to know what is
  // already here. Unnamed (id 0) slots are left out — the phone can't match
  // them to a ref, so claiming them would only suppress a needed prefetch.
  if (dict_find(iter, MESSAGE_KEY_CACHE_QUERY)) {
    if (s_hs_timer) { app_timer_cancel(s_hs_timer); s_hs_timer = NULL; }
    s_hs_tries = 0;
    handshake_reply(NULL);
  }

  // SEL_IDS: the phone's ordered selection. Kept for offline advance, and
  // every cached image that is no longer selected gives its slot back — the
  // only thing that ever shrinks the cache.
  if ((t = dict_find(iter, MESSAGE_KEY_SEL_IDS))) {
    int n = t->length / 4;
    if (n > SEL_MAX) { n = SEL_MAX; }
    const uint8_t *p = t->value->data;
    bool ids_changed = n != s_sel_n;
    for (int i = 0; i < n; i++) {
      uint32_t id = (uint32_t)p[i * 4] | ((uint32_t)p[i * 4 + 1] << 8)
               | ((uint32_t)p[i * 4 + 2] << 16) | ((uint32_t)p[i * 4 + 3] << 24);
      if (s_sel[i] != id) { ids_changed = true; }
      s_sel[i] = id;
    }
    if (ids_changed) { cache_read_cancel(); }
    cancel_request();
    cancel_fallback();
    img_transfer_reset();
    s_phone_selection = true; s_legacy_phone = false;
    s_sel_n = n;
    if (ids_changed) {
      s_settings_dirty = true; state_dirty();
      persist_write_data(PERSIST_KEY_SEL_IDS, s_sel, (size_t)n * 4);
    }
    // SEL_GROUPS rides the same message: one byte per entry, bits 0..6 the
    // group index, bit 7 "this group loops at its end". A phone JS that doesn't
    // send it means one looping group — the whole selection wraps, as before.
    Tuple *gt = dict_find(iter, MESSAGE_KEY_SEL_GROUPS);
    const uint8_t *gp = gt ? gt->value->data : NULL;
    int gn = gt ? (int)gt->length : 0;
    bool groups_changed = ids_changed;
    for (int i = 0; i < n; i++) {
      uint8_t group = (i < gn) ? gp[i] : 0x80;
      if (s_sel_grp[i] != group) { groups_changed = true; }
      s_sel_grp[i] = group;
    }
    if (groups_changed) {
      persist_write_data(PERSIST_KEY_SEL_GROUPS, s_sel_grp, (size_t)n);
      s_shown_mask = 0; s_settings_dirty = true; state_dirty();
    }  // a new selection starts a new shuffle cycle
    int freed = 0;
    uint32_t before = s_slot_used;
    for (int s = 0; s < SLOT_COUNT; s++) {
      if (!s_slot[s].len) { continue; }
      // Never drop what is on screen: the user would be left looking at an
      // image the watch could no longer redraw after a relaunch.
      if (s_slot[s].id == s_active_id) { continue; }
      bool keep = false;
      for (int i = 0; i < n; i++) { if (s_sel[i] == s_slot[s].id) { keep = true; break; } }
      if (!keep) { img_slot_free(s); freed++; }
    }
    APP_LOG(APP_LOG_LEVEL_INFO, "SEL_IDS: %d selected, freed %d slot(s), used %u -> %u",
            n, freed, (unsigned int)before, (unsigned int)s_slot_used);
    // Re-anchor the cursor on whatever is actually on screen. If that image
    // just left the selection it has to leave the screen too — the user
    // deselected it, and nothing else would ever move off it.
    int pos = -1;
    for (int i = 0; i < n; i++) { if (s_sel[i] == s_active_id) { pos = i; break; } }
    if (pos >= 0) {
      // The reconnect echo must not cancel a launch read or redirect a
      // cached advance that is already working on the same selection.
      if (!s_read_buf) { s_desired_id = s_active_id; set_sel_pos(pos); }
    } else if (n > 0) {
      APP_LOG(APP_LOG_LEVEL_INFO, "SEL_IDS: id=%08x is no longer selected, advancing",
              (unsigned int)s_active_id);
      if (skip_to_next_available(0)) { if (!s_read_buf) { notify_cursor(s_sel_pos); } }
      else {
        s_sel_pos = -1;
        s_need_image = true;
        s_desired_id = s_sel[0];
        request_idx(0);
        set_loading(true);
        // No fallback to an image the user removed. The handshake and cache
        // completion can retry this replacement even with rotation disabled.
      }
    }
  }

  // IMG_SHOW: the phone believes this image is already on the watch, so it
  // sent 4 bytes instead of 16 KB. A hit is the fast path the whole cache
  // exists for; a miss answers CACHE_MISS and the phone streams as before.
  if ((t = dict_find(iter, MESSAGE_KEY_IMG_SHOW))) {
    uint32_t id = t->value->uint32;
    img_transfer_reset();    // a display request supersedes any transfer
    img_slot_abort_write();  // ...and frees the prefetch buffer before we decode
    if (show_slot(id)) {
      APP_LOG(APP_LOG_LEVEL_INFO, "IMG_SHOW %08x hit", (unsigned int)id);
      // Legacy path only (the phone falls back to it when the handshake times
      // out), so its overrides are news: file them under the image.
      s_read_ack = true;
      if (got_ov) {
        s_read_flags = ov_word; s_read_override = true;
        ov_store_for(id, ov_word);
      }
    } else {
      APP_LOG(APP_LOG_LEVEL_INFO, "IMG_SHOW %08x miss", (unsigned int)id);
      reply_id(MESSAGE_KEY_CACHE_MISS, id);
    }
    return;
  }

  // IMG_BUILTIN names a bundled image by index — no transfer, load from flash.
  Tuple *builtin = dict_find(iter, MESSAGE_KEY_IMG_BUILTIN);
  if (builtin) {
    int bidx = (int)builtin->value->int32;
    show_builtin(bidx);
    // The overrides that came with it are this built-in's, not the screen's:
    // remember them so a later local show of it looks the same.
    if (got_ov && bidx >= 0 && bidx < (int)BUILTIN_COUNT) {
      ov_store_for(ID_BUILTIN(bidx), ov_word);
    }
    return;
  }

  // IMG_TOTAL begins a chunked image transfer.
  Tuple *total = dict_find(iter, MESSAGE_KEY_IMG_TOTAL);
  if (total) {
    Tuple *idt = dict_find(iter, MESSAGE_KEY_IMG_ID);
    // No IMG_ID = a pre-1.1.0 phone JS: display it and cache it unnamed
    // (id 0), which is exactly what 1.0.12 did.
    uint32_t id = idt ? idt->value->uint32 : ID_NONE;
    // Backstop only. The phone is what actually keeps a background prefetch off
    // the wire while a display image is being fetched or streamed; this catches
    // the case where one starts anyway, before any of its chunks arrive. Once
    // both transfers are running nothing here can help: IMG_CHUNK carries no
    // identity, so a stray prefetch chunk is indistinguishable from a display
    // chunk. Refusing with CACHE_FULL stops the round; the next one retries.
    if (is_prefetch && (s_read_buf || (s_img_buf && !s_img_prefetch))) {
      APP_LOG(APP_LOG_LEVEL_WARNING,
              "Refusing prefetch %08x: a display transfer is in flight (%u/%u bytes)",
              (unsigned int)id, (unsigned int)s_img_received, (unsigned int)s_img_total);
      reply_id(MESSAGE_KEY_CACHE_FULL, id);
      return;
    }
    if (!is_prefetch) { cache_read_cancel(); }
    img_transfer_reset();
    // A DISPLAY transfer needs the heap: the bitmap on screen, the incoming PNG
    // and soon the decoder all share it. A prefetch still draining into flash
    // holds another PNG's worth, and its slot write is doomed anyway (the
    // display's own img_slot_begin_write aborts it on completion) — so drop it
    // now instead of carrying 16 KB of it through the transfer. The phone's
    // next prefetch round retries that image.
    if (!is_prefetch && s_cache_buf) {
      APP_LOG(APP_LOG_LEVEL_INFO, "Display transfer: dropping the slot write in progress");
      img_slot_abort_write();
    }
    uint32_t size = total->value->uint32;
    if (size == 0 || size > MAX_IMAGE_BYTES) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Rejecting transfer of %u bytes (max %d)",
              (unsigned int)size, MAX_IMAGE_BYTES);
      return;
    }
    if (is_prefetch) {
      // A prefetch must never cost the face its picture: the incoming PNG, the
      // bitmap on screen and (soon) the decoder all share one heap. Refuse
      // early — the phone drops this image from the round rather than waiting.
      uint32_t heap = heap_bytes_free();
      if (!s_slot_ready || !s_alloc_ready) {
        APP_LOG(APP_LOG_LEVEL_INFO, "Refusing prefetch %08x: cache unavailable", (unsigned int)id);
        reply_id(MESSAGE_KEY_CACHE_FULL, id);
        return;
      }
      if (heap < IMG_CACHE_MIN_HEAP) {
        APP_LOG(APP_LOG_LEVEL_WARNING, "Refusing prefetch %08x: heap free=%u below %d",
                (unsigned int)id, (unsigned int)heap, IMG_CACHE_MIN_HEAP);
        reply_id(MESSAGE_KEY_CACHE_FULL, id);
        return;
      }
      if (s_slot_used + size + IMG_CACHE_HEADROOM > persist_get_max_size()) {
        APP_LOG(APP_LOG_LEVEL_WARNING, "Refusing prefetch %08x: quota %u + %u of %u",
                (unsigned int)id, (unsigned int)s_slot_used, (unsigned int)size,
                (unsigned int)persist_get_max_size());
        reply_id(MESSAGE_KEY_CACHE_FULL, id);
        return;
      }
      APP_LOG(APP_LOG_LEVEL_INFO, "Prefetch %08x begin: %u bytes; heap free=%u before malloc",
              (unsigned int)id, (unsigned int)size, (unsigned int)heap);
    }
    s_img_buf = malloc(size);
    if (!s_img_buf) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "malloc %u failed (heap free=%u)",
              (unsigned int)size, (unsigned int)heap_bytes_free());
      if (is_prefetch) { reply_id(MESSAGE_KEY_CACHE_FULL, id); }
      return;
    }
    s_img_total = size;
    s_img_received = 0;
    s_img_id = id;
    Tuple *seq = dict_find(iter, MESSAGE_KEY_IMG_SEQ);
    s_img_seq = seq ? seq->value->uint32 : 0;
    s_img_prefetch = is_prefetch;
    s_img_ov = ov_word;
    img_transfer_bump_timer();
    APP_LOG(APP_LOG_LEVEL_INFO, "Transfer begin: %u bytes, id=%08x%s; heap free=%u after malloc",
            (unsigned int)size, (unsigned int)id, is_prefetch ? " (prefetch)" : "",
            (unsigned int)heap_bytes_free());
  }

  // IMG_CHUNK appends bytes in order until the buffer is full.
  Tuple *chunk = dict_find(iter, MESSAGE_KEY_IMG_CHUNK);
  if (chunk) {
    if (!s_img_buf) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Chunk with no active transfer");
      return;
    }
    Tuple *seq = dict_find(iter, MESSAGE_KEY_IMG_SEQ);
    Tuple *offset = dict_find(iter, MESSAGE_KEY_IMG_OFFSET);
    if (s_img_seq && (!seq || seq->value->uint32 != s_img_seq || !offset)) { return; }
    uint16_t len = chunk->length;
    if (s_img_seq) {
      uint32_t off = offset->value->uint32;
      if (off < s_img_received && len <= s_img_received - off) { return; } // retried acknowledged chunk
      if (off != s_img_received) { img_transfer_reset(); return; }
    }
    if (s_img_received + len > s_img_total) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Chunk overflow, aborting transfer");
      img_transfer_reset();
      return;
    }
    memcpy(s_img_buf + s_img_received, chunk->value->data, len);
    s_img_received += len;

    if (s_img_received >= s_img_total) {
      APP_LOG(APP_LOG_LEVEL_INFO, "Transfer complete: %u bytes", (unsigned int)s_img_total);

      // Take the PNG out of the transfer state: it outlives the decode as the
      // on-watch cache copy (img_slot_begin_write owns it from here).
      uint8_t *png = s_img_buf;
      uint32_t png_len = s_img_total;
      uint32_t png_id = s_img_id;
      bool png_prefetch = s_img_prefetch;
      uint32_t png_ov = s_img_ov;
      s_img_buf = NULL;
      img_transfer_reset();

      if (png_prefetch) {
        // Silent: straight to flash. The bitmap on screen, the overlay, the
        // active id and the spinner are all untouched — a prefetch is
        // invisible by construction. CACHE_ACK goes out when the run lands,
        // which is what paces the phone's next prefetch.
        APP_LOG(APP_LOG_LEVEL_INFO, "Prefetch %08x received: %u bytes; heap free=%u",
                (unsigned int)png_id, (unsigned int)png_len, (unsigned int)heap_bytes_free());
        img_slot_begin_write(png, png_len, png_id, true, png_ov);
        return;
      }

      if (s_phone_selection && png_id != s_desired_id) { free(png); return; }
      // Free the shown image before decoding so the ~46KB bitmap and the PNG
      // decoder never peak together.
      bitmap_layer_set_bitmap(s_image_layer, NULL);
      if (s_bitmap) {
        gbitmap_destroy(s_bitmap);
        s_bitmap = NULL;
      }

      GBitmap *decoded = gbitmap_create_from_png_data(png, png_len);
      if (!decoded) {
        APP_LOG(APP_LOG_LEVEL_ERROR, "PNG decode failed (unsupported format or low memory)");
        free(png);
        set_loading(false);
        return;
      }

      cancel_fallback();
      s_bitmap = decoded;
      bitmap_layer_set_bitmap(s_image_layer, s_bitmap);
      layer_mark_dirty(bitmap_layer_get_layer(s_image_layer));
      set_loading(false);
      int displayed_idx = s_requested_idx;
      if (displayed_idx < 0) {
        for (int i = 0; i < s_sel_n; i++) { if (s_sel[i] == png_id) { displayed_idx = i; break; } }
      }
      set_active_id(png_id, true);
      if (displayed_idx >= 0) { set_sel_pos(displayed_idx); notify_cursor(displayed_idx); }
      img_slot_begin_write(png, png_len, png_id, false, png_ov);
      APP_LOG(APP_LOG_LEVEL_INFO, "Displayed streamed image id=%08x; heap free=%u",
              (unsigned int)png_id, (unsigned int)heap_bytes_free());
    } else {
      img_transfer_bump_timer();
    }
  }
}

static void inbox_dropped_handler(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "AppMessage inbox dropped (reason %d)", (int)reason);
}

static TextLayer *make_overlay_layer(Layer *root, GTextAlignment align) {
  TextLayer *l = text_layer_create(GRect(0, 0, 10, 10));  // apply_layout() sets frames
  text_layer_set_background_color(l, GColorClear);
  text_layer_set_text_alignment(l, align);
  // One line per cell: a stack that runs long truncates with an ellipsis
  // (the settings-page preview shows the same truncation).
  text_layer_set_overflow_mode(l, GTextOverflowModeTrailingEllipsis);
  layer_add_child(root, text_layer_get_layer(l));
  return l;
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_image_layer = bitmap_layer_create(bounds);
  bitmap_layer_set_compositing_mode(s_image_layer, GCompOpSet);
  bitmap_layer_set_alignment(s_image_layer, GAlignCenter);
  layer_add_child(root, bitmap_layer_get_layer(s_image_layer));

  // Bar underlay: above the image, below every text/cell layer.
  s_bars_layer = layer_create(bounds);
  layer_set_update_proc(s_bars_layer, bars_update_proc);
  layer_set_hidden(s_bars_layer, true);
  layer_add_child(root, s_bars_layer);

  s_time_shadow = make_overlay_layer(root, GTextAlignmentCenter);
  s_time_layer = make_overlay_layer(root, GTextAlignmentCenter);

  for (int c = 0; c < CELLS; c++) {
    // Cells paint themselves (text + glyph runs); apply_layout() sets frames.
    s_cell_layer[c] = layer_create(GRect(0, 0, 10, 10));
    layer_set_update_proc(s_cell_layer[c], cell_update_proc);
    layer_set_hidden(s_cell_layer[c], true);
    layer_add_child(root, s_cell_layer[c]);
  }

  s_spinner_layer = layer_create(GRect(0, 0, SPIN_PX, SPIN_PX));
  layer_set_update_proc(s_spinner_layer, spinner_update_proc);
  layer_set_hidden(s_spinner_layer, true);
  layer_add_child(root, s_spinner_layer);

  apply_layout();
  // Launch image. A streamed photo (upload or hosted) has no flash copy, so
  // when THAT was on screen at exit, drawing the saved built-in now shows the
  // wrong picture for the seconds the phone needs to re-stream (field report:
  // "the default lion appears before my photo, then flashes back"). With the
  // phone reachable, hold the plain backdrop under the clock and let the
  // transfer land; restore_builtin() covers a phone that never answers.
  // Best case the exact image is cached on the watch under its id (see
  // img_slot_*) and shows instantly; the phone's re-send on connect is then
  // just an IMG_SHOW that hits the same slot. ACTIVE_ID is 0 for a pre-1.1.0
  // unnamed transfer, and show_slot(0) finds its slot by id like any other.
  // Fast path: the boot record says which slot holds the on-screen image and
  // what its bytes hash to, so no index, no header — one record plus the image.
  bool shown = false;
  if (s_last_streamed && s_slot_ready && s_active_slot >= 0) {
    shown = cache_read_start(s_active_slot, s_active_id, s_active_len, s_active_hash,
                              ov_pack(s_ov_pos, s_ov_ink, s_ov_bg, s_ov_bar), false);
    if (shown) {
      cancel_fallback();
      set_loading(false);
      APP_LOG(APP_LOG_LEVEL_INFO, "Launch: id=%08x from slot %d, no index needed",
              (unsigned int)s_active_id, s_active_slot);
    } else {
      s_active_slot = -1;  // the record lied; fall back to the indexed path
      state_dirty();
    }
  }
  if (shown) {
    // painted
  } else if (s_last_streamed && show_slot(s_active_id)) {
    APP_LOG(APP_LOG_LEVEL_INFO, "Launch: id=%08x straight from flash", (unsigned int)s_active_id);
  } else if (s_last_streamed && connection_service_peek_pebble_app_connection()) {
    // Not on the watch and the phone is there: ask for it by cursor position
    // right now. The outbox may not be up yet this early — harmless, the
    // phone's connect handshake asks NEED_IMAGE and covers exactly this.
    s_need_image = true;
    if (s_sel_n > 0 && s_sel_pos >= 0) { request_idx(s_sel_pos); }
    cancel_fallback();
    s_fallback_timer = app_timer_register(FALLBACK_MS, restore_builtin, NULL);
  } else {
    show_builtin(s_current_image);
  }
  update_time();
  update_info();
}

static void window_unload(Window *window) {
  cache_read_cancel();
  cancel_fallback();
  set_loading(false);
  layer_destroy(s_spinner_layer);
  s_spinner_layer = NULL;
  for (int c = 0; c < CELLS; c++) {
    layer_destroy(s_cell_layer[c]);
    s_cell_layer[c] = NULL;
  }
  text_layer_destroy(s_time_layer);
  text_layer_destroy(s_time_shadow);
  layer_destroy(s_bars_layer);
  s_bars_layer = NULL;
  bitmap_layer_destroy(s_image_layer);
  if (s_bitmap) {
    gbitmap_destroy(s_bitmap);
    s_bitmap = NULL;
  }
}

// Read the selection records; n comes from the record itself.
static void load_selection(void) {
  int n = persist_read_data(PERSIST_KEY_SEL_IDS, s_sel, sizeof(s_sel));
  s_sel_n = (n > 0) ? n / 4 : 0;
  for (int i = 0; i < s_sel_n; i++) { s_sel_grp[i] = 0x80; }
  if (s_sel_n > 0) { persist_read_data(PERSIST_KEY_SEL_GROUPS, s_sel_grp, sizeof(s_sel_grp)); }
  if (s_sel_pos >= s_sel_n) { s_sel_pos = -1; }
}

static void init(void) {
  time_t t_sec; uint16_t t_ms; time_ms(&t_sec, &t_ms);
  uint32_t t_init = (uint32_t)t_sec * 1000u + t_ms;

  // The ONE lookup allowed to miss (see PERSIST_KEY_STATE). Absent = first run
  // of this build: probe the legacy keys and scan the headers, then write every
  // record so no later launch ever probes again.
  s_schema_seen = persist_exists(PERSIST_KEY_SCHEMA) ? persist_read_int(PERSIST_KEY_SCHEMA) : 0;
  // Version 3 wrote the same records minus the active-slot fields: upgrade in
  // place (see ensure_loaded). Anything older is a real first run.
  bool fresh = s_schema_seen < 3;

  if (fresh) {
    APP_LOG(APP_LOG_LEVEL_INFO, "First run of this build: migrating the persist store (slow once)");
    load_settings(true);
    if (persist_exists(PERSIST_KEY_LAST_STREAMED)) { s_last_streamed = persist_read_bool(PERSIST_KEY_LAST_STREAMED); }
    if (persist_exists(PERSIST_KEY_ACTIVE_ID)) { s_active_id = (uint32_t)persist_read_int(PERSIST_KEY_ACTIVE_ID); }
    if (persist_exists(PERSIST_KEY_SEL_IDS)) {
      if (persist_exists(PERSIST_KEY_SEL_POS)) { s_sel_pos = persist_read_int(PERSIST_KEY_SEL_POS); }
      load_selection();
    }
    if (persist_exists(PERSIST_KEY_ACTIVE_IMAGE)) {
      int saved = persist_read_int(PERSIST_KEY_ACTIVE_IMAGE);
      if (saved >= 0 && saved < (int)BUILTIN_COUNT) { s_current_image = saved; }
    }
    img_slot_scan();
    cache_alloc_init();
    // Built-in overrides are not migrated: the phone re-sends them (OV_SET) in
    // its next handshake, which is cheaper than probing 20 keys.
    // Now write the records the fast path reads (boot record, index, built-in
    // overrides), then the schema marker LAST so a crash here just redoes this.
    s_state_dirty = s_bov_dirty = true;
    state_flush_now();
    persist_write_int(PERSIST_KEY_SCHEMA, SCHEMA_VERSION);
    s_schema_seen = SCHEMA_VERSION;
    s_loaded = true;  // everything above went through RAM already
  } else {
    FaceState st;
    memset(&st, 0, sizeof(st));
    int n = persist_read_data(PERSIST_KEY_STATE, &st, sizeof(st));
    bool ok = (n == (int)sizeof(st) && st.version == SCHEMA_VERSION);
    if (!ok && n == (int)FACESTATE_V3_SIZE && st.version == 3) { st.active_slot = -1; ok = true; }
    if (ok) {
      s_set = st.set;
      sanitize_settings();
      s_temp_val = st.temp_val;
      s_temp_known = st.temp_known != 0;
      s_active_id = st.active_id;
      s_sel_pos = st.sel_pos;
      s_ov_pos = st.ov_pos; s_ov_ink = st.ov_ink; s_ov_bg = st.ov_bg; s_ov_bar = st.ov_bar;
      s_shown_mask = st.shown_mask;
      s_last_streamed = st.last_streamed != 0;
      if (st.active_image >= 0 && st.active_image < (int)BUILTIN_COUNT) { s_current_image = st.active_image; }
      s_boot_sel_n = st.sel_n;
      s_active_slot = (st.active_slot >= 0 && st.active_slot < SLOT_COUNT) ? st.active_slot : -1;
      s_active_len = st.active_len;
      s_active_hash = st.active_hash;
    } else {
      APP_LOG(APP_LOG_LEVEL_WARNING, "Boot record unreadable; defaults until the phone re-sends settings");
    }
    // The slot index, built-in overrides and selection wait for ensure_loaded():
    // only the quota gate (a syscall, no lookup) is needed to paint.
    s_slot_ready = img_slot_available();
  }
  time_ms(&t_sec, &t_ms);
  APP_LOG(APP_LOG_LEVEL_INFO, "Persist load: %ums (%s)",
          (unsigned int)((uint32_t)t_sec * 1000u + t_ms - t_init), fresh ? "first run" : "indexed");
  // Shuffle picks uniformly from the entries not yet shown this cycle; without
  // a seed every watch would walk the same "random" order after every launch.
  srand((unsigned int)time(NULL));

  s_desired_id = s_active_id;
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);
  // Everything launch did not need: read it right after the first paint.
  if (!s_loaded) { app_timer_register(50, deferred_load_cb, NULL); }

  resubscribe_ticks();
  // The 'no phone' point appears/disappears with the app connection.
  connection_service_subscribe((ConnectionHandlers) {
    .pebble_app_connection_handler = app_connection_handler,
  });
  battery_state_service_subscribe(battery_handler);
  accel_tap_service_subscribe(accel_tap_handler);

  app_message_register_inbox_received(inbox_received_handler);
  app_message_register_inbox_dropped(inbox_dropped_handler);
  // Inbox sized for 4KB image chunks (+ dict overhead): a streamed 15KB image
  // is ~4 Bluetooth round-trips instead of the ~30 that 512-byte chunks cost.
  // Emery has >100KB of free heap; the buffer is cheap, the round-trips aren't.
  // The outbox used to be 64 bytes (REQUEST_NEXT and nothing else); the
  // handshake reply packs up to CACHE_LIST_MAX 8-byte entries (480 bytes) plus
  // CURSOR_IDX and NEED_IMAGE, so it needs ~510 plus dict overhead.
  AppMessageResult open_result = app_message_open(4200, 640);
  if (open_result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "app_message_open failed (%d)", (int)open_result);
  }
}

static void deinit(void) {
  cache_read_cancel();
  cancel_request();
  if (s_clock_cf) { fonts_unload_custom_font(s_clock_cf); }
  if (s_info_cf) { fonts_unload_custom_font(s_info_cf); }
  if (s_hs_timer) { app_timer_cancel(s_hs_timer); s_hs_timer = NULL; }
  img_transfer_reset();
  if (s_gc_timer) { app_timer_cancel(s_gc_timer); s_gc_timer = NULL; }
  img_slot_abort_write();  // an unfinished run stays invalid (header is zeroed first)
  if (s_gc_timer) { app_timer_cancel(s_gc_timer); s_gc_timer = NULL; }
  // Playback is a best-effort checkpoint. Leaving during the idle window
  // must not block navigation on a flash write. Configuration remains durable;
  // the cache index is recoverable from headers and needs no exit flush.
  state_flush_on_exit();
  accel_tap_service_unsubscribe();
  battery_state_service_unsubscribe();
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
