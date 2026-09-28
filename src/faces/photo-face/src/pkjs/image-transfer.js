// GENERATED from src/shared/image-face/image-transfer.js. Do not edit this copy.
// Shared ordered, cancellable image transport. Sequence + offset also make
// retry delivery idempotent and reject chunks from superseded streams.
exports.create = function (hooks) {
  var wireSeq = 0;
  var MAX_IMAGE_BYTES = 32768, CHUNK_SIZE = 4096, MAX_RETRIES = 3;
return function sendTransfer(bytes, gen, ovm, id, pf) {
  var total = bytes.length;
  var sequence = ++wireSeq;
  if (total === 0 || total > MAX_IMAGE_BYTES) {
    hooks.log('Refusing transfer of ' + total + ' bytes (limit ' + MAX_IMAGE_BYTES + ')');
    hooks.status('Image too large');
    if (!pf) { hooks.idle(gen); }
    return;
  }
  // Staleness check. AppMessage delivery is ordered and the next chunk is only
  // issued from the previous one's ack, so a superseded stream has at most one
  // message in flight when the new stream's IMG_TOTAL is sent — and that stray
  // lands BEFORE the new IMG_TOTAL, which resets the watch's reassembly buffer.
  function stale(offset) {
    var dead = hooks.stale(gen, pf);
    if (!dead) { return false; }
    hooks.log('Transfer superseded, abandoning at offset ' + offset);
    return true;
  }
  function sendChunk(offset, attempt) {
    if (offset >= total) { hooks.log('All chunks sent (' + total + ' bytes)'); if (!pf) { hooks.idle(gen); } return; }
    var chunk = bytes.slice(offset, offset + CHUNK_SIZE);
    hooks.send({ IMG_CHUNK: chunk, IMG_SEQ: sequence, IMG_OFFSET: offset },
      function () { if (stale(offset)) { return; } sendChunk(offset + CHUNK_SIZE, 0); },
      function (err) {
        if (stale(offset)) { return; }
        if (attempt < MAX_RETRIES) { hooks.log('Chunk @' + offset + ' retry ' + (attempt + 1)); sendChunk(offset, attempt + 1); }
        else { hooks.log('Chunk @' + offset + ' gave up: ' + JSON.stringify(err)); if (!pf) { hooks.idle(gen); } }
      });
  }
  function sendBegin(attempt) {
    // IMG_ID names the image so the watch can file it under its own slot, and
    // OV_* rides EVERY transfer, prefetch included: the watch stores an image's
    // look in its slot header so it can apply it when IT decides to show the
    // image. A prefetch still never touches the screen (IMG_PREFETCH tells the
    // watch to store and not apply), so the picture on it is undisturbed.
    var first = { IMG_TOTAL: total, IMG_ID: id | 0, IMG_SEQ: sequence };
    if (pf) { first.IMG_PREFETCH = 1; }
    if (ovm) {
      first.OV_POS = ovm.OV_POS; first.OV_INK = ovm.OV_INK;
      first.OV_BG = ovm.OV_BG; first.OV_BAR = ovm.OV_BAR;
    }
    hooks.send(first,
      function () { if (stale(0)) { return; } sendChunk(0, 0); },
      function (err) {
        if (stale(0)) { return; }
        if (attempt < MAX_RETRIES) { hooks.log('IMG_TOTAL retry ' + (attempt + 1)); sendBegin(attempt + 1); }
        else { hooks.log('IMG_TOTAL gave up: ' + JSON.stringify(err)); if (!pf) { hooks.idle(gen); } }
      });
  }
  sendBegin(0);
};
};
