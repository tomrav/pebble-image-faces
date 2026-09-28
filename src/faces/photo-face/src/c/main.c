#include <pebble.h>

// Photo Face owns its gallery resources; playback and rendering are shared.
// >>>GEN:GALLERY>>>
static const uint32_t s_builtin_resources[] = {
  RESOURCE_ID_IMAGE_B_ANIMALS_1,
  RESOURCE_ID_IMAGE_B_SPACE_1,
  RESOURCE_ID_IMAGE_B_ARCHITECTURE_1,
  RESOURCE_ID_IMAGE_B_TRANSPORT_1,
  RESOURCE_ID_IMAGE_B_FLORA_1,
};
// <<<GEN:GALLERY<<<

#include "face-engine.h"
