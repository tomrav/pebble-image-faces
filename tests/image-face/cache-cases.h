static void state_dirty(void){}
static void index_dirty(void){}
static void bov_dirty(void){}
static void ensure_loaded(void){}
static void cancel_request(void){}
static bool request_idx(int idx){return false;}
static void handshake_reply(void*data){}
static void handshake_reply_now(void){}
static void reboot_cache(void){
 for(int i=0;i<nt;i++)timers[i].active=false;
 if(s_cache_buf)free(s_cache_buf);s_cache_buf=NULL;s_cache_timer=NULL;s_cache_slot=-1;
 s_gc_timer=NULL;s_gc_slot=-1;s_gc_pending=0;s_alloc_ready=false;
 memset(s_slot,0,sizeof(s_slot));memset(&s_alloc,0,sizeof(s_alloc));
 img_slot_load_index();cache_alloc_init();
}
int main(void){
 unsigned char bytes[256];memset(bytes,42,sizeof(bytes));
 // A committed old image with a longer stale tail, and an old evicted image.
 ImgSlotHdr valid={300,123,0x80000001,0},empty={0};
 persist_write_data(SLOT_HDR_KEY(0),&valid,sizeof(valid));
 for(int i=0;i<4;i++)persist_write_data(SLOT_DATA_KEY(0)+i,bytes,256);
 persist_write_data(SLOT_HDR_KEY(1),&empty,sizeof(empty));
 for(int i=0;i<3;i++)persist_write_data(SLOT_DATA_KEY(1)+i,bytes,256);
 reboot_cache();int journal_before=journal_writes;assert(s_gc_timer->at-now==CACHE_GC_START_MS);
 AppTimer*first=s_gc_timer;first->active=false;now=first->at;int ops_before=storage_ops;first->fn(NULL);
 assert(storage_ops==ops_before+1);assert(s_gc_timer->at-now>=400);drain();
 assert(journal_writes==journal_before+1);
 assert(s_alloc_ready);assert(s_slot[0].id==valid.id);assert(s_slot[0].len==300);
 assert(sizes[SLOT_DATA_KEY(0)]==256&&sizes[SLOT_DATA_KEY(0)+1]==256);
 assert(sizes[SLOT_DATA_KEY(0)+2]==0&&sizes[SLOT_DATA_KEY(1)]==0);
 assert(s_slot_used==512);
 // A stable ledger must not be rewritten on launch, even with valid images.
 journal_before=journal_writes;reboot_cache();drain();assert(journal_writes==journal_before);
 // Failed deletion retains allocation, and a later boot finishes cleanup.
 fail_delete=SLOT_DATA_KEY(0)+1;img_slot_free(0);drain();assert(s_slot_used==512);
 fail_delete=-1;reboot_cache();drain();assert(s_slot_used==0);
 // The final header fails: do not acknowledge uncommitted bytes.
 unsigned char *png=malloc(300);memset(png,7,300);
 img_slot_begin_write(png,300,0x80000002,true,0);assert(s_cache_slot>=0);
 fail_header=SLOT_HDR_KEY(s_cache_slot);drain();assert(reply_key==MESSAGE_KEY_CACHE_FULL);assert(img_slot_find(0x80000002)<0);
 fail_header=-1;assert(s_slot_used==0);
 // Crash after a partial write. Reservation survived, header did not commit.
 png=malloc(3000);memset(png,8,3000);img_slot_begin_write(png,3000,0x80000003,true,0);
 img_slot_write_tick(NULL);assert(s_cache_written==256);reboot_cache();drain();assert(s_slot_used==0);
 // A committed image survives an index that was never flushed before a crash.
 png=malloc(300);memset(png,9,300);img_slot_begin_write(png,300,0x80000004,true,0);drain();assert(reply_key==MESSAGE_KEY_CACHE_ACK);
 reboot_cache();drain();assert(img_slot_find(0x80000004)>=0);assert(s_slot_used==512);
 // Unnamed legacy images are mutable and must restore the most recent bytes.
 png=malloc(3);memset(png,10,3);img_slot_begin_write(png,3,0,false,0);drain();
 png=malloc(3);memset(png,11,3);img_slot_begin_write(png,3,0,false,0);drain();
 reboot_cache();drain();int legacy=img_slot_find(0);assert(legacy>=0&&store[SLOT_DATA_KEY(legacy)][0]==11);
 // Known empty slots incur no maintenance calls or writes on the next boot.
 for(int i=0;i<SLOT_COUNT;i++)if(s_slot[i].len)img_slot_free(i);
 drain();reboot_cache();assert(s_gc_pending==0&&s_gc_timer==NULL);
 puts("cache migration, reclamation, write failure, and crash recovery passed");
}
