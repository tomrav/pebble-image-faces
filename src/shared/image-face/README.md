# Image-face runtime

Shared by Photo Face and the generated franchise watchfaces. Each project has a
small `main.c` resource wrapper. `FACE_LEGACY_TOGGLES` enables franchise-only legacy
message keys without changing Photo Face's numeric wire ABI.

- `face-state.h`: settings and UI state declarations.
- `face-transfer.h`: incoming transfer ownership and timeout.
- `face-cache.h`: persistent image slots, allocation journal, background recovery.
- `face-playback.h`: selection, request/fallback state, overrides, persistence.
- `face-overlay.h`: text, glyphs, and layout.
- `face-events.h`: validated message dispatch, lifecycle, subscriptions.
- `image-transfer.js`: cancellable, sequenced PKJS image transport.

The headers are included in dependency order by `face-engine.h` and compiled as
one translation unit. They are private implementation modules, not a public API.
Edit these sources and run `npm run pebble:sync-runtime`. Per-project copies are
generated so a project still builds independently with `pebble build`.

Cache key 76 holds a versioned allocation ledger. Reservation is written before
PNG records; header commit makes an image valid, and only actual deletion releases
quota. Legacy contiguous runs are located by binary search. Cleanup always deletes
from the tail so interrupted repair remains discoverable. Slot headers are
reconciled against the index in the background after launch. Failed deletions retain
reservations. Repair starts after a 10-second startup grace period, skips known
empty slots, and yields for at least 250 ms (four times the measured storage
latency for slow calls). The repair ledger and recovered index are batched at
completion; unchanged ledgers are never rewritten. PNG writes yield after each
256-byte record, with a two-minute phone prefetch deadline. Reconnecting with
unchanged settings/selection avoids redundant writes, and exit no longer writes
obsolete downgrade keys. Older downgraded versions may restore an older cursor. Cached image decode still uses the SDK's synchronous
PNG decoder; hardware latency and battery behavior require device testing.

Wire additions are append-only: IMG_SEQ identifies a transfer, IMG_OFFSET makes
chunk retries idempotent. Existing unsequenced transfers use ordered legacy
reassembly. A named foreground image must match the watch's desired image before
its overrides or bytes can affect the display. Gesture input is debounced for
900 ms; further gestures coalesce while a remote advance is pending.

Regression suite: `npm run pebble:test-runtime` (Node plus native C with address
and undefined-behavior sanitizers). No external network or Pebble SDK is needed.

Cached image reads now use one storage operation per timer callback, including
the header. The previous picture remains visible until a separate decode callback;
only completion commits the cursor and sends CACHE_ACK. Settings, foreground
transfers, bundled images and exit cancel pending reads. Diagnostic logs split
header lookup, data reads, PNG decode and total elapsed time. The SDK decoder and
an individual storage syscall still run synchronously.

Playback checkpoints wait for five quiet seconds, restarting the timer on every
change/accepted shake and deferring while a foreground image is pending. Exit
saves changed settings/overrides but skips a playback-only checkpoint and the
recoverable cache index. Leaving immediately after shaking can therefore restore
the previous checkpoint's image/cursor, including its shuffle history.
