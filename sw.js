/* KS Transport service worker
   Pages (HTML): network first, so the newest uploaded version wins whenever you are online.
   If the network is slow (4 seconds) or offline, the last saved copy is used instead.
   Icons, manifest and the PDF library: saved copy first, refreshed quietly in the background.
   Only caches whose name starts with "kst-" are ever deleted. Your trips, fuel and other records
   are NOT stored in these caches, so updating never touches them. */
const VERSION='2026-11-23-a';
const CACHE='kst-'+VERSION;
const LIB='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const CORE=['./','index.html','manifest.json','icon-192.png','icon-512.png','icon-maskable-512.png'];
const NET_TIMEOUT=4000;
const abs=u=>new URL(u,self.registration.scope).href;
const timeout=(p,ms)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),ms);p.then(v=>{clearTimeout(t);res(v)},e=>{clearTimeout(t);rej(e)})});

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await Promise.all(CORE.map(async u=>{try{const r=await fetch(abs(u),{cache:'reload'});if(r&&r.ok)await c.put(abs(u),r)}catch(x){}}));
    try{const r=await fetch(LIB,{cache:'reload'});if(r&&r.ok)await c.put(LIB,r)}catch(x){}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()){if(k.startsWith('kst-')&&k!==CACHE)await caches.delete(k)}
    const c=await caches.open(CACHE),keep=new Set([...CORE.map(abs),LIB]);
    for(const r of await c.keys()){if(!keep.has(r.url))await c.delete(r)}
    await self.clients.claim();
  })());
});

self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const u=new URL(req.url);
  if(u.origin!==location.origin&&req.url!==LIB)return;
  if(u.pathname.endsWith('/version.json'))return;            // always asked from the network
  const isPage=req.mode==='navigate'||(req.headers.get('accept')||'').includes('text/html');
  e.respondWith(isPage?pageFirst(req):assetsFirst(req));
});

async function pageFirst(req){
  const c=await caches.open(CACHE);
  const saved=()=>c.match(req.url,{ignoreSearch:true}).then(r=>r||c.match(abs('index.html')));
  const net=fetch(req.url,{cache:'no-cache',credentials:'same-origin'}).then(r=>{if(r&&r.ok)c.put(req.url,r.clone());return r});
  try{
    const r=await timeout(net,NET_TIMEOUT);
    if(r.ok)return r;
    return (await saved())||r;
  }catch(x){
    return (await saved())||Response.error();
  }
}

async function assetsFirst(req){
  const c=await caches.open(CACHE);
  const hit=await c.match(req,{ignoreSearch:true,ignoreVary:true});
  const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone());return r}).catch(()=>null);
  return hit||(await net)||Response.error();
}
