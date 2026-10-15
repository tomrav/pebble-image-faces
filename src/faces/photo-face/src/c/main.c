#include <pebble.h>

// Photo Face owns its gallery resources; playback and rendering are shared.
// >>>GEN:GALLERY>>>
static const uint32_t s_builtin_resources[] = {
  RESOURCE_ID_IMAGE_B_SPACE_1,
};
// <<<GEN:GALLERY<<<

#include "face-engine.h"
