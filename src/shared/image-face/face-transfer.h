// Shared Photo Face / franchise engine. Included by face-engine.h in dependency order.
static int s_current_image = 0;
// True while a STREAMED image (no flash copy) is on screen. Persisted, so a
// relaunch knows the saved built-in is not what the user was looking at.
static bool s_last_streamed;

// Incoming chunked image transfer (same wire protocol as touch-glass).
#define MAX_IMAGE_BYTES 32768
#define IMG_TRANSFER_TIMEOUT_MS 5000
// One buffer for every image on the move: an incoming transfer, a cached read
// or a slot write. Allocated once at launch and never freed. Allocating per
// image let the heap fragment around the last one (fonts, message buffers and
// the storage index land in its hole), until a Time 2 with the LCD clock and
// every data point had 45KB free and no 28KB block: every request for a
// photo not yet on the watch failed, and so did every prefetch, leaving the
// face cycling the few photos it held (2026-10-15). One owner at a time
// (s_img_buf, s_read_buf or s_cache_buf); the owners already serialise each
// other: a display cancels reads and writes, a prefetch is refused while
// anything is in flight.
static uint8_t *s_img_arena;
static uint8_t *s_img_buf;
static uint32_t s_img_total;
static uint32_t s_img_received;
// Identity of the transfer in flight (IMG_ID; 0 = a pre-1.1.0 phone JS that
// doesn't name its images) and whether it is a silent PREFETCH — reassembled
// straight to flash, never shown.
static uint32_t s_img_id;
static uint32_t s_img_seq;
static bool s_img_prefetch;
// The packed overrides that rode this transfer's IMG_TOTAL, on their way to the
// slot header (a prefetch stores them; only a display transfer also applies).
static uint32_t s_img_ov;
static AppTimer *s_img_timer;

static void img_transfer_reset(void) {
  if (s_img_timer) {
    app_timer_cancel(s_img_timer);
    s_img_timer = NULL;
  }
  s_img_buf = NULL;  // releases the arena; nothing to free
  s_img_total = 0;
  s_img_received = 0;
  s_img_id = 0;
  s_img_seq = 0;
  s_img_prefetch = false;
  s_img_ov = 0;
}

static void img_transfer_timeout(void *data) {
  s_img_timer = NULL;
  APP_LOG(APP_LOG_LEVEL_WARNING, "Transfer timed out at %u/%u bytes, aborting",
          (unsigned int)s_img_received, (unsigned int)s_img_total);
  img_transfer_reset();
  set_loading(false);
}

static void img_transfer_bump_timer(void) {
  if (s_img_timer) {
    app_timer_reschedule(s_img_timer, IMG_TRANSFER_TIMEOUT_MS);
  } else {
    s_img_timer = app_timer_register(IMG_TRANSFER_TIMEOUT_MS, img_transfer_timeout, NULL);
  }
}
