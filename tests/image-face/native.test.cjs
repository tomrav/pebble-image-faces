const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
function native(name,source){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'face-test-'));try{fs.writeFileSync(path.join(dir,'test.c'),source);cp.execFileSync('cc',['-std=c11','-fsanitize=address,undefined',path.join(dir,'test.c'),'-o',path.join(dir,'test')],{stdio:'pipe'});return cp.execFileSync(path.join(dir,'test'),{encoding:'utf8'});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const read=p=>fs.readFileSync(p,'utf8');
function fn(file,name){
 const source=read(file), pattern=new RegExp('static (?:void|bool|int) '+name+'\\([^)]*\\)\\s*\\{','m');
 const m=pattern.exec(source);assert.ok(m,name);let depth=1,end=m.index+m[0].length;
 while(depth&&end<source.length){const c=source[end++];if(c==='{')depth++;if(c==='}')depth--;}
 assert.equal(depth,0,name);return source.slice(m.index,end);
}
test('native persistent cache survives eviction, storage failures, and interrupted writes',()=>{
 const source=read('src/shared/image-face/face-cache.h').split('// Read `len`')[0];
 assert.match(native('cache',read('tests/image-face/cache-mocks.h')+source+read('tests/image-face/cache-cases.h')),/passed/);
});
test('native shake debounce and busy request preserve one pending advance',()=>{
 const playback='src/shared/image-face/face-playback.h',events='src/shared/image-face/face-events.h';
 const src=`#include <stdbool.h>\n#include <stdint.h>\n#include <assert.h>\n#include <stdio.h>\n#include <time.h>\n#define APP_LOG(...) ((void)0)\n#define APP_MSG_OK 0\n#define MESSAGE_KEY_REQUEST_IDX 1\ntypedef int AccelAxisType;typedef int AppTimer;typedef int DictionaryIterator;typedef int AppMessageResult;\nstatic struct {bool shake;} s_set={true};static bool s_had_shake;static uint32_t s_last_shake_ms;static int clock_ms,advances,busy=1,sends;\nstatic uint32_t s_desired_id,s_sel[]={1,2,3};static int s_sel_n=3,s_requested_idx=-1,s_request_tries;static AppTimer*s_request_timer,*s_request_expiry;static bool s_need_image;static uint32_t s_active_id=1;\nstatic void time_ms(time_t*s,uint16_t*m){*s=clock_ms/1000;*m=clock_ms%1000;}\nstatic void advance_photo(bool spin){advances++;}\nstatic void schedule_flush(void){}\nstatic void set_loading(bool b){}\nstatic void app_timer_cancel(AppTimer*t){}\nstatic AppTimer*app_timer_register(int delay,void(*fn)(void*),void*d){static int t;return &t;}\nstatic int app_message_outbox_begin(DictionaryIterator**out){static int o;*out=&o;return busy;}\nstatic void dict_write_int32(DictionaryIterator*out,int key,int32_t id){}\nstatic int app_message_outbox_send(void){sends++;return 0;}\nstatic bool request_idx(int idx);\n`+
 fn(playback,'cancel_request')+'\n'+fn(playback,'request_expired')+'\n'+fn(playback,'request_retry')+'\n'+fn(playback,'request_idx')+'\n'+fn(events,'accel_tap_handler')+`
int main(void){accel_tap_handler(0,1);clock_ms=100;accel_tap_handler(1,-1);clock_ms=899;accel_tap_handler(0,1);assert(advances==1);clock_ms=900;accel_tap_handler(0,1);assert(advances==2);assert(!request_idx(1));assert(sends==0&&s_requested_idx==1&&s_desired_id==2);busy=0;request_retry(NULL);assert(sends==1);request_expired(NULL);assert(s_requested_idx==-1);busy=1;request_idx(2);for(int n=0;n<7;n++)request_retry(NULL);assert(s_requested_idx==-1);busy=0;assert(request_idx(2));puts("passed");}\n`;
 assert.match(native('shake',src),/passed/);
});
test('watch rejects obsolete image envelopes before their overlays can be applied',()=>{
 const src=`#include <stdint.h>\n#include <stdbool.h>\n#include <assert.h>\n#include <stdio.h>\n#define APP_LOG(...) ((void)0)\n#define ID_BUILTIN(i) ((uint32_t)((i)+1))\n#define ID_NONE 0\n#define MESSAGE_KEY_IMG_TOTAL 0\n#define MESSAGE_KEY_IMG_SHOW 1\n#define MESSAGE_KEY_IMG_BUILTIN 2\n#define MESSAGE_KEY_IMG_PREFETCH 3\n#define MESSAGE_KEY_IMG_ID 4\ntypedef union {uint32_t uint32;int32_t int32;} Value;typedef struct {Value*value;} Tuple;typedef int DictionaryIterator;static Value vals[5];static Tuple tuples[5];static bool present[5];\nstatic Tuple*dict_find(DictionaryIterator*i,int k){tuples[k].value=&vals[k];return present[k]?&tuples[k]:0;}\nstatic int s_sel_n=2;static bool s_phone_selection=true,s_legacy_phone;static uint32_t s_desired_id=0x80000002;\n`+fn('src/shared/image-face/face-events.h','display_message_is_current')+`
int main(void){present[0]=present[4]=true;vals[4].uint32=0x80000001;assert(!display_message_is_current(0));vals[4].uint32=s_desired_id;assert(display_message_is_current(0));present[4]=false;assert(!display_message_is_current(0));present[3]=true;assert(display_message_is_current(0));s_phone_selection=false;present[3]=false;assert(display_message_is_current(0));puts("passed");}\n`;
 assert.match(native('envelope',src),/passed/);
});
test('an entirely uncached replacement selection requests an image with rotation disabled',()=>{
 const event=read('src/shared/image-face/face-events.h');
 const start=event.indexOf('  if ((t = dict_find(iter, MESSAGE_KEY_SEL_IDS)))');
 const block=event.slice(start,event.indexOf('\n  // IMG_SHOW:',start));
 const src=`#include <stdint.h>\n#include <stdbool.h>\n#include <assert.h>\n#include <stdio.h>\n#define APP_LOG(...) ((void)0)\n#define SEL_MAX 64\n#define SLOT_COUNT 48\n#define MESSAGE_KEY_SEL_IDS 0\n#define MESSAGE_KEY_SEL_GROUPS 1\n#define PERSIST_KEY_SEL_IDS 41\n#define PERSIST_KEY_SEL_GROUPS 44\ntypedef union {uint8_t data[256];} Value;typedef struct{int length;Value*value;}Tuple;typedef int DictionaryIterator;\nstatic Value v={{0,0,0,128}};static Tuple ids={4,&v};static Tuple*dict_find(DictionaryIterator*i,int k){return k==0?&ids:0;}\nstatic uint32_t s_sel[64],s_active_id=1,s_desired_id=1,s_slot_used;static uint8_t s_sel_grp[64];static int s_sel_n=1,s_sel_pos=0,requested=-1,writes;static uint64_t s_shown_mask;static bool s_need_image,loading,s_phone_selection,s_legacy_phone,s_settings_dirty;static void*s_read_buf;static void cache_read_cancel(void){s_read_buf=0;}static struct{uint32_t id,len;}s_slot[48];\nstatic void cancel_request(void){requested=-1;}static void cancel_fallback(void){}static void img_transfer_reset(void){}static void state_dirty(void){}static void persist_write_data(int k,void*p,int n){writes++;}static void img_slot_free(int s){}static void set_sel_pos(int p){s_sel_pos=p;}static bool skip_to_next_available(int i){return false;}static void notify_cursor(int i){}static bool request_idx(int i){requested=i;return false;}static void set_loading(bool b){loading=b;}\nstatic void apply(DictionaryIterator*iter){Tuple*t;\n`+block+`\n}\nint main(void){apply(0);assert(requested==0&&s_need_image&&loading);assert(s_desired_id==0x80000000&&s_sel_pos==-1&&s_active_id==1);assert(writes==2);s_read_buf=(void*)1;s_active_id=s_sel[0];apply(0);assert(writes==2&&s_read_buf);puts("passed");}\n`;
 assert.match(native('selection',src),/passed/);
});
test('state writes wait for idle and exit preserves settings without saving playback',()=>{
 const file='src/shared/image-face/face-playback.h';
 const delay=read(file).match(/#define FLUSH_MS (\d+)/)[1];
 const src=read('tests/image-face/cache-mocks.h')+`
#define FLUSH_MS ${delay}
static bool s_state_dirty,s_index_dirty,s_bov_dirty,s_settings_dirty;
static void*s_read_buf,*s_img_buf;static bool s_img_prefetch;static int s_requested_idx=-1;
static AppTimer*s_flush_timer;static int flushes;
static void state_flush_now(void){flushes++;s_state_dirty=s_settings_dirty=s_bov_dirty=false;}
`+fn(file,'flush_timer_cb')+'\n'+fn(file,'schedule_flush')+'\n'+fn(file,'state_dirty')+'\n'+fn(file,'state_flush_on_exit')+`
int main(void){state_dirty();AppTimer*old=s_flush_timer;now=1000;state_dirty();assert(!old->active&&s_flush_timer->at==now+FLUSH_MS);now=1400;state_dirty();assert(s_flush_timer->at==6400);s_read_buf=(void*)1;AppTimer*t=s_flush_timer;t->active=false;now=t->at;t->fn(NULL);assert(flushes==0&&s_flush_timer);s_read_buf=NULL;drain();assert(flushes==1);state_dirty();state_flush_on_exit();assert(flushes==1&&!s_flush_timer);s_settings_dirty=true;state_dirty();state_flush_on_exit();assert(flushes==2);puts("passed");}
`;
 assert.match(native('idle',src),/passed/);
});
test('cached reads yield, cancel safely, validate bytes and commit only after decode',()=>{
 const cache=read('src/shared/image-face/face-cache.h').split('// Remember what')[0];
 const graphics=`
typedef int GBitmap;static GBitmap*s_bitmap;static void*s_image_layer;
static int decodes,completed,failed;static bool decode_fail;
static void bitmap_layer_set_bitmap(void*l,GBitmap*b){}
static void*gbitmap_create_from_png_data(void*p,int n){decodes++;storage_ms+=15;return decode_fail?NULL:malloc(sizeof(GBitmap));}
static void gbitmap_destroy(GBitmap*b){free(b);}
static void*bitmap_layer_get_layer(void*l){return l;}
static void layer_mark_dirty(void*l){}
`;
 const callbacks=`
static void state_dirty(void){}static void index_dirty(void){}static void bov_dirty(void){}
static void ensure_loaded(void){}static void cancel_request(void){}static bool request_idx(int i){return false;}
static void handshake_reply(void*d){}static void handshake_reply_now(void){}
static void cache_read_complete(bool ok,uint32_t id,uint32_t flags,int idx,bool ack){if(ok){completed++;s_active_id=id;}else{failed++;}}
static void step_read(void){AppTimer*t=s_read_timer;assert(t);t->active=false;now=t->at;t->fn(NULL);}
int main(void){
 unsigned char png[600];memset(png,17,sizeof(png));uint32_t id=0x80000001;
 ImgSlotHdr h={600,img_hash(png,600),id,123};persist_write_data(SLOT_HDR_KEY(0),&h,sizeof(h));
 for(int off=0;off<600;off+=256)persist_write_data(SLOT_DATA_KEY(0)+off/256,png+off,600-off>256?256:600-off);
 s_bitmap=malloc(sizeof(GBitmap));GBitmap*old=s_bitmap;s_active_id=99;
 int before=storage_ops;assert(cache_read_start(0,id,600,0,0,true));assert(storage_ops==before&&s_bitmap==old);
 for(int i=0;i<4;i++){before=storage_ops;step_read();assert(storage_ops==before+1&&completed==0&&s_bitmap==old&&s_active_id==99);}
 step_read();assert(completed==1&&decodes==1&&s_active_id==id&&!s_read_buf&&s_active_slot==0);
 assert(cache_read_start(0,id,600,0,0,true));step_read();cache_read_cancel();drain();assert(completed==1&&!s_read_buf);
 assert(cache_read_start(0,id,600,0,0,true));s_desired_id=42;step_read();assert(!s_read_buf&&completed==1);
 // Corrupt bytes never replace the current bitmap or commit a cursor.
 store[SLOT_DATA_KEY(0)][0]^=1;assert(cache_read_start(0,id,600,0,0,true));drain();assert(failed==1&&completed==1&&decodes==1);
 store[SLOT_DATA_KEY(0)][0]^=1;persist_write_data(SLOT_HDR_KEY(0),&h,sizeof(h));decode_fail=true;assert(cache_read_start(0,id,600,0,0,true));drain();assert(failed==2&&!s_read_buf&&!s_bitmap);
 puts("passed");}
`;
 assert.match(native('reader',read('tests/image-face/cache-mocks.h')+graphics+cache+callbacks),/passed/);
});
