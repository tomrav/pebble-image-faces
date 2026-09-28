#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <assert.h>
#include <time.h>
static int storage_ms,storage_ops,journal_writes;
static void time_ms(time_t*s,uint16_t*m){*s=storage_ms/1000;*m=storage_ms%1000;}
#define PERSIST_DATA_MAX_LENGTH 256
#define MAX_IMAGE_BYTES 32768
#define BUILTIN_COUNT 5
#define BUILTIN_OV_MAX 20
#define PERSIST_KEY_IDX_IDS 71
#define PERSIST_KEY_IDX_LENS 72
#define PERSIST_KEY_IDX_FLAGS 73
#define MESSAGE_KEY_CACHE_ACK 10
#define MESSAGE_KEY_CACHE_FULL 11
#define S_TRUE 1
#define E_DOES_NOT_EXIST -2
#define APP_MSG_OK 0
#define APP_LOG(...) ((void)0)
typedef int status_t;
typedef struct {int major,minor,patch;} WatchInfoVersion;
static WatchInfoVersion watch_info_get_firmware_version(void){return (WatchInfoVersion){4,9,171};}
static unsigned char store[7000][256];
static int sizes[7000],fail_header=-1,fail_delete=-1,reply_key;
static int actual_used(void){int n=0;for(int i=0;i<7000;i++)n+=sizes[i];return n;}
static int persist_get_max_size(void){return 1024*1024;}
static int persist_get_size(int k){return sizes[k]?sizes[k]:E_DOES_NOT_EXIST;}
static bool persist_exists(int k){return sizes[k]>0;}
static int persist_read_data(int k,void*p,int n){storage_ops++;storage_ms+=100;if(!sizes[k])return -2;if(n>sizes[k])n=sizes[k];memcpy(p,store[k],n);return n;}
static int persist_write_data(int k,const void*p,int n){
 storage_ops++;storage_ms+=100;if(k==76)journal_writes++;
 if(k==fail_header||n>256||actual_used()-sizes[k]+n>persist_get_max_size())return -3;
 memcpy(store[k],p,n);sizes[k]=n;return n;
}
static int persist_delete(int k){if(k==fail_delete)return -3;if(!sizes[k])return E_DOES_NOT_EXIST;sizes[k]=0;return S_TRUE;}
typedef struct {void(*fn)(void*);void*data;bool active;int at;} AppTimer;
static AppTimer timers[20000];static int nt,now;
static AppTimer *app_timer_register(int delay,void(*fn)(void*),void*d){assert(nt<20000);timers[nt]=(AppTimer){fn,d,true,now+delay};return &timers[nt++];}
static void app_timer_cancel(AppTimer*t){t->active=false;}
static void drain(void){for(int steps=0;steps<10000;steps++){AppTimer*t=NULL;for(int i=0;i<nt;i++)if(timers[i].active&&(!t||timers[i].at<t->at))t=&timers[i];if(!t)return;t->active=false;now=t->at;t->fn(t->data);}assert(!"timer loop");}
typedef int DictionaryIterator;
static int app_message_outbox_begin(DictionaryIterator**out){static int v;*out=&v;return 0;}
static void dict_write_int32(DictionaryIterator*out,int key,int32_t id){reply_key=key;}
static void app_message_outbox_send(void){}
static bool connection_service_peek_pebble_app_connection(void){return false;}
