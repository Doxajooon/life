/* Life Control V56 CLEAN — application runtime */
'use strict';
const KEY='LIFE_CONTROL_V52';
const BACKUP_KEY='LIFE_CONTROL_V52_SNAPSHOT';
const BACKUP2_KEY='LIFE_CONTROL_V52_SNAPSHOT_2';
const LEGACY=['LIFE_CONTROL_V46','LIFE_CONTROL_V45','LIFE_CONTROL_V40','LIFE_CONTROL_V39','LIFE_CONTROL_V38','LIFE_CONTROL_V37','LIFE_CONTROL_V36','LIFE_CONTROL_V35','LIFE_CONTROL_V33','LIFE_CONTROL_V32','LIFE_CONTROL_V31','LIFE_CONTROL_V30','LIFE_CONTROL_V29','LIFE_CONTROL_V28','LIFE_CONTROL_V27','LIFE_CONTROL_V26','LIFE_CONTROL_V25','LIFE_CONTROL_V24','LIFE_CONTROL_V23','LIFE_CONTROL_V22','LIFE_CONTROL_V21','LIFE_CONTROL_V20','LIFE_CONTROL_V18','LIFE_CONTROL_V17','LIFE_CONTROL_V16','LIFE_CONTROL_V15','LIFE_CONTROL_V14','LIFE_CONTROL_V13','LIFE_CONTROL_V12','LIFE_CONTROL_V11','LIFE_CONTROL_V10','LIFE_CONTROL_V9'];
const DAY_MS=86400000,TRASH_TTL=30*DAY_MS;
const PROFIT_SOURCES=['Зарплата','Фриланс','Спортивная аналитика'];
const PROFIT_ICONS={'Зарплата':'💼','Фриланс':'💻','Спортивная аналитика':'📊'};
const DEFAULT={
  version:56,
  profile:{name:'',currency:'сомони'},
  wallet:{openingBalance:0},
  settings:{theme:'light',preMinutes:10,notifications:true,fontScale:1.06,viewMode:''},
  ai:{endpoint:'https://riqmwueobjazfnhvvumy.supabase.co/functions/v1/life-control-ai',model:'gemini-3.6-flash',enabled:true,webSearch:false,lastAnalysisAt:'',history:[],consent:{goal:true,money:true,reports:true,notes:false}},
  income:4500,
  runtimeErrors:[],
  debts:{bank:100000,firms:120000,monthlyPayment:5200},
  goal:{title:'Стать финансово независимым',why:'Сформировать самостоятельную жизнь на собственном доходе, закрыть долги и создать устойчивую основу для семьи.',next:'Стабилизировать ежемесячный денежный поток и двигаться по текущему долгу.',aiPlan:null,aiPlanAt:'',aiPlanGoalKey:'',finance:{targetAmount:0,savedAmount:0,manualSavedAmount:0,targetDate:'',startedAt:'',completedAt:'',contributions:[]},milestones:[
    {id:'m1',title:'Остановить рост долга и держать деньги под контролем',done:false},
    {id:'m2',title:'Закрыть основную часть долгов',done:false},
    {id:'m3',title:'Закончить необходимые комнаты и бытовую базу',done:false},
    {id:'m4',title:'Создать устойчивый доход и финансовый резерв',done:false}
  ]},
  day:{steps:[
    {id:'s1',title:'Работа',text:'Главный рабочий блок. Английский — только в свободном окне, без отдельной задачи.',time:'08:30',end:'18:00',details:['Закрыть текущие заявки и размеры без ошибок','Сделать качественный раскрой и проверить результат','Закрыть то, что действительно влияет на доход и репутацию','В свободное окно — английский, если работа позволяет']},
    {id:'s2',title:'Дом, семья и отдых',text:'После работы не создавать новую гонку: семья, бытовые дела, спокойный отдых.',time:'18:00',end:'21:30',details:['Переключиться после дороги и поесть','Сделать только один заранее выбранный шаг по дому, если он нужен','Провести время с семьёй','Не брать новые большие задачи вечером']},
    {id:'s3',title:'Итог дня',text:'Закрыть день: факты, вывод и одно действие на завтра.',time:'21:30',end:'22:00',details:['Записать факт дня','Записать, что помешало','Зафиксировать движение к цели','Определить один шаг на завтра']}
  ]},
  budgets:[],profits:[],expenses:[],reports:{},notes:[],notesTrash:[],achievements:[],notificationsLog:[],lastReadAt:'',dailyMotivations:{},_sent:{},daily:{},dayMode:'normal',debtHistory:[],debtBaseline:null,drafts:{note:null,moneyProfit:null,moneyExpense:null,goalEdit:null,goalFinance:null,achievement:null,debt:null,settingsSteps:null,goalSaving:null,budget:null}
};

const $=id=>document.getElementById(id), $$=sel=>Array.from(document.querySelectorAll(sel));
const clone=x=>JSON.parse(JSON.stringify(x));
function uid(){try{return crypto.randomUUID()}catch(e){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function merge(a,b){if(a===undefined||a===null)return clone(b);if(Array.isArray(b))return Array.isArray(a)?a:clone(b);if(typeof b==='object'&&b){const o={...b};for(const k of Object.keys(a||{}))o[k]=merge(a[k],b[k]);return o}return a}
function keyDay(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function validDate(d){const x=d instanceof Date?d:new Date(d);return !Number.isNaN(x.getTime())?x:null}
function fmtDate(d=new Date()){const x=validDate(d)||new Date();return x.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
function fmtDateTime(d){const x=validDate(d);return x?x.toLocaleString('ru-RU',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}
function fmtMoney(n){return Number(n||0).toLocaleString('ru-RU')+' '+(state.profile.currency||'сомони')}
function timeToMin(v){const [h,m]=String(v).split(':').map(Number);return (Number(h)||0)*60+(Number(m)||0)}
function nowMin(){const d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60}
function fmtDuration(mins){mins=Math.max(0,Math.round(mins));const h=Math.floor(mins/60),m=mins%60;return h?`${h} ч ${String(m).padStart(2,'0')} мин`:`${m} мин`}
function hasTextSelection(){try{const sel=window.getSelection();return !!(sel && !sel.isCollapsed && String(sel).length)}catch(e){return false}}
function setText(id,value){const el=$(id);if(el && el.textContent!==String(value))el.textContent=String(value)}
function setWidth(id,value){const el=$(id);if(el){const v=String(value);if(el.style.width!==v)el.style.width=v}}
function dayReport(){const k=keyDay();state.reports[k]=state.reports[k]||{done:'',block:'',future:'',tomorrow:'',savedAt:'',steps:{}};state.reports[k].steps=state.reports[k].steps||{};return state.reports[k]}
function purgeExpiredTrash(s){const before=(s.notesTrash||[]).length,cut=Date.now()-TRASH_TTL;s.notesTrash=(s.notesTrash||[]).filter(n=>Date.parse(n.deletedAt||0)>cut);return before-s.notesTrash.length}
function normalize(s){
  const hadWallet=!!(s.wallet&&typeof s.wallet==='object'&&Object.prototype.hasOwnProperty.call(s.wallet,'openingBalance'));
  s=merge(s,DEFAULT);s.version=56;s.settings=s.settings&&typeof s.settings==='object'?s.settings:clone(DEFAULT.settings);s.settings.fontScale=clamp(Number(s.settings.fontScale)||1.06,.98,1.12);
  s.wallet=s.wallet&&typeof s.wallet==='object'?s.wallet:{openingBalance:0};
  s.wallet.openingBalance=Math.max(0,Number(s.wallet.openingBalance)||0);
  if(!hadWallet){
    const legacyIncome=(Array.isArray(s.profits)?s.profits:[]).reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0);
    const legacyExpense=(Array.isArray(s.expenses)?s.expenses:[]).reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0);
    const legacyManual=Math.max(0,Number(s.goal?.finance?.manualSavedAmount)||0);
    const legacyContrib=(Array.isArray(s.goal?.finance?.contributions)?s.goal.finance.contributions:[]).reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0);
    const legacyGoal=legacyManual+legacyContrib;
    s.wallet.openingBalance=Math.max(0,legacyGoal-legacyManual-(legacyIncome-legacyExpense));
  }
  if(!s._lastSavedAt)s._lastSavedAt='';
  if(!s.reports||typeof s.reports!=='object')s.reports={};
  // Never discard previous calendar days: reports are intentionally keyed by YYYY-MM-DD.
  for(const [k,v] of Object.entries(s.reports)){
    if(v && typeof v==='object'){
      v.steps=v.steps&&typeof v.steps==='object'?v.steps:{};
      v.done=String(v.done||'');v.block=String(v.block||'');v.future=String(v.future||'');v.tomorrow=String(v.tomorrow||'');v.savedAt=String(v.savedAt||'');
    }
  }
  if(!Array.isArray(s.budgets))s.budgets=[];s.budgets=s.budgets.map(b=>({id:b.id||uid(),name:String(b.name||'Без названия'),planned:Math.max(0,Number(b.planned)||0)})).filter(b=>b.name);if(!Array.isArray(s.profits))s.profits=[];s.profits=s.profits.map(x=>{const y={...x};const g=normalizeProfitSource(y.sourceGroup||y.source);y.amount=Math.max(0,Number(y.amount)||0);y.source=g;y.sourceGroup=g;return y});if(!Array.isArray(s.expenses))s.expenses=[];s.expenses=s.expenses.map(x=>{const y={...x};y.amount=Math.max(0,Number(y.amount)||0);y.category=String(y.category||'Другое');y.categoryIcon=y.categoryIcon||'🧾';return y});if(!Array.isArray(s.notes))s.notes=[];s.notes=s.notes.map(n=>({...n,id:n.id||uid(),title:String(n.title||'Без заголовка'),body:String(n.body||''),at:n.at||n.createdAt||new Date().toISOString(),pinned:!!n.pinned,updatedAt:n.updatedAt||''}));if(!Array.isArray(s.notesTrash))s.notesTrash=[];s.notesTrash=s.notesTrash.map(n=>({...n,id:n.id||uid(),title:String(n.title||'Без заголовка'),body:String(n.body||''),at:n.at||n.createdAt||new Date().toISOString(),pinned:!!n.pinned,updatedAt:n.updatedAt||'',deletedAt:n.deletedAt||new Date().toISOString()}));if(!Array.isArray(s.achievements))s.achievements=[];if(!Array.isArray(s.notificationsLog))s.notificationsLog=[];
  if(!s.reports||typeof s.reports!=='object')s.reports={};if(!s.dailyMotivations||typeof s.dailyMotivations!=='object')s.dailyMotivations={};if(!s._sent||typeof s._sent!=='object')s._sent={};if(!s.daily||typeof s.daily!=='object')s.daily={};if(!['normal','heavy','rest'].includes(s.dayMode))s.dayMode='normal';if(!Array.isArray(s.debtHistory))s.debtHistory=[];s.drafts=s.drafts&&typeof s.drafts==='object'?s.drafts:clone(DEFAULT.drafts);for(const k of Object.keys(DEFAULT.drafts))if(!(k in s.drafts))s.drafts[k]=clone(DEFAULT.drafts[k]);if(!(Number(s.debtBaseline)>0)){const base=Number(s.debts?.bank||0)+Number(s.debts?.firms||0);if(base>0)s.debtBaseline=base;}
  s.day=s.day&&Array.isArray(s.day.steps)?s.day:clone(DEFAULT.day);s.day.steps=s.day.steps.slice(0,3);while(s.day.steps.length<3)s.day.steps.push(clone(DEFAULT.day.steps[s.day.steps.length]));
  for(let i=0;i<s.day.steps.length;i++){const d=DEFAULT.day.steps[i];s.day.steps[i]=merge(s.day.steps[i],d);if(!Array.isArray(s.day.steps[i].details))s.day.steps[i].details=[]}
  s.goal=s.goal&&Array.isArray(s.goal.milestones)?s.goal:clone(DEFAULT.goal);s.goal.finance=merge(s.goal.finance||{},DEFAULT.goal.finance);s.goal.finance.targetAmount=Math.max(0,Number(s.goal.finance.targetAmount)||0);s.goal.finance.savedAmount=Math.max(0,Number(s.goal.finance.savedAmount)||0);s.goal.finance.manualSavedAmount=Math.max(0,Number(s.goal.finance.manualSavedAmount)||0);if(!('manualSavedAmount' in s.goal.finance))s.goal.finance.manualSavedAmount=s.goal.finance.savedAmount;s.goal.finance.targetDate=s.goal.finance.targetDate||'';s.goal.finance.startedAt=s.goal.finance.startedAt||'';s.goal.finance.completedAt=s.goal.finance.completedAt||'';s.goal.finance.contributions=Array.isArray(s.goal.finance.contributions)?s.goal.finance.contributions:[];if(s.goal.finance.contributions.length===0&&Number(s.goal.finance.manualSavedAmount||0)===0&&Number(s.goal.finance.savedAmount||0)>0)s.goal.finance.manualSavedAmount=Number(s.goal.finance.savedAmount||0);s.goal.milestones=s.goal.milestones.map((m,i)=>merge(m,DEFAULT.goal.milestones[i]||{id:uid(),title:`Этап ${i+1}`,done:false}));
  s.ai=s.ai&&typeof s.ai==='object'?s.ai:clone(DEFAULT.ai);s.ai.endpoint=AI_FUNCTION_URL;s.ai.model=AI_MODEL;s.ai.enabled=s.ai.enabled!==false;s.ai.webSearch=!!s.ai.webSearch;s.ai.history=Array.isArray(s.ai.history)?s.ai.history:[];s.ai.consent=s.ai.consent&&typeof s.ai.consent==='object'?s.ai.consent:clone(DEFAULT.ai.consent);purgeExpiredTrash(s);return s;
}
function safeReadStorage(k){try{return localStorage.getItem(k)}catch(e){return null}}
function candidateStates(){
  const list=[];
  for(const k of [KEY,BACKUP_KEY,BACKUP2_KEY,...LEGACY]){
    const raw=safeReadStorage(k);if(!raw)continue;
    try{const parsed=normalize(JSON.parse(raw));list.push({key:k,state:parsed,stamp:Date.parse(parsed._lastSavedAt||'')||0})}catch(e){}
  }
  return list;
}
function load(){
  const candidates=candidateStates();
  if(candidates.length){
    candidates.sort((a,b)=>b.stamp-a.stamp);
    return candidates[0].state;
  }
  return normalize(clone(DEFAULT));
}
let state=load(),toastTimer=null,lastDay='',lastTick=0,autosaveTimer=null; let moneyViewDate=keyDay();

const CLOUD_DIRTY_KEY='LIFE_CONTROL_CLOUD_DIRTY_V1';
let cloudSyncTimer=null, cloudSyncInFlight=null, _localDirtySinceCloud=false, _cloudBaseFingerprint='', appReadyForSync=false;
try{_localDirtySinceCloud=localStorage.getItem(CLOUD_DIRTY_KEY)==='1'}catch(e){}
async function cloudPullIntoLocal(){try{const pulled=await cloudPull();if(!pulled?.row?.state)return false;const localDirty=_localDirtySinceCloud||(()=>{try{return localStorage.getItem(CLOUD_DIRTY_KEY)==='1'}catch(e){return false}})();if(localDirty)return false;const localStamp=Date.parse(state._lastSavedAt||'')||0;const cloudStamp=Date.parse(pulled.row.state._lastSavedAt||pulled.row.updated_at||'')||0;if(cloudStamp>localStamp){state=normalize(pulled.row.state);state[CLOUD_BASE_KEY]=pulled.row.updated_at||pulled.row.state._lastSavedAt||'';_persistFingerprint='';_cloudBaseFingerprint=stateFingerprint();clearCloudDirty();saveState();renderAll();scheduleNative();return true}return false}catch(e){return false}}
function stateFingerprint(){try{const x=clone(state);delete x._lastSavedAt;delete x._persistentStorageRequestedAt;delete x._persistentStorageGranted;delete x[CLOUD_BASE_KEY];return JSON.stringify(x)}catch(e){return ''}}
function markCloudDirty(){_localDirtySinceCloud=true;try{localStorage.setItem(CLOUD_DIRTY_KEY,'1')}catch(e){}}
function clearCloudDirty(){_localDirtySinceCloud=false;try{localStorage.removeItem(CLOUD_DIRTY_KEY)}catch(e){}}
function queueCloudSync(){clearTimeout(cloudSyncTimer);cloudSyncTimer=setTimeout(()=>{if(appReadyForSync&&cloudAuth()&&_persistFingerprint)cloudAutoSync().catch(()=>{})},2500)}
function saveState(){
  try{
    const purgedTrashCount=purgeExpiredTrash(state);
    const fingerprint=stateFingerprint();
    if(fingerprint && fingerprint===_persistFingerprint){
      return;
    }
    if(fingerprint && _cloudBaseFingerprint && fingerprint!==_cloudBaseFingerprint)markCloudDirty();
    state._lastSavedAt=new Date().toISOString();
    const savedAt=state._lastSavedAt;
    const payload=JSON.stringify(state);
    let ok=false;
    try{
      const prev=localStorage.getItem(KEY);
      if(prev && prev!==payload) localStorage.setItem(BACKUP2_KEY,prev);
      localStorage.setItem(KEY,payload);
      localStorage.setItem(BACKUP_KEY,payload);
      ok=true;
    }catch(e){}
    const mirrorPromise=mirrorToIndexedDB(payload,savedAt);
    if(purgedTrashCount>0)mirrorPromise.then(()=>compactRecoverySnapshots()).catch(()=>{});
    mirrorPromise.catch(()=>{});
    try{syncChannel?.postMessage({payload,savedAt})}catch(e){}
    if(fingerprint)_persistFingerprint=fingerprint;
    if(!ok && !state._storageWarned){state._storageWarned=true;toast('Локальное сохранение недоступно','Проверь свободную память устройства.')}
    queueCloudSync();
  }catch(e){try{console.error('Life Control save error',e)}catch(_){}}
}
function queueAutosave(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>saveState(),180)}
let idbPromise=null,syncChannel=null,idbWriteChain=Promise.resolve();
function openLifeDB(){
  if(idbPromise)return idbPromise;
  idbPromise=new Promise(resolve=>{
    if(!('indexedDB' in window)){resolve(null);return}
    try{
      const req=indexedDB.open('LifeControlDB',1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('state'))db.createObjectStore('state',{keyPath:'id'});if(!db.objectStoreNames.contains('backups'))db.createObjectStore('backups',{keyPath:'id'})};
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{try{db.close()}catch(e){}};resolve(db)};req.onerror=()=>resolve(null);
    }catch(e){resolve(null)}
  });
  return idbPromise;
}
function openLegacyDB(){return new Promise(resolve=>{if(!('indexedDB' in window)){resolve(null);return}try{const req=indexedDB.open('LifeControlV26DB');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null)}catch(e){resolve(null)}})}
function mirrorToIndexedDB(payload,savedAt){
  idbWriteChain=idbWriteChain.then(async()=>{
    const db=await openLifeDB();if(!db)return false;
    try{
      await new Promise(resolve=>{
        const tx=db.transaction(['state','backups'],'readwrite');
        const stateStore=tx.objectStore('state'),backupStore=tx.objectStore('backups');
        const getReq=stateStore.get('current');
        getReq.onsuccess=()=>{
          const prev=getReq.result;
          if(prev?.payload&&prev.savedAt){backupStore.put({id:String(prev.savedAt),savedAt:prev.savedAt,payload:prev.payload});}
          stateStore.put({id:'current',savedAt,payload});
        };
        tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve();
      });
      // Keep only the latest 8 durable snapshots.
      await new Promise(resolve=>{
        const tx=db.transaction('backups','readwrite'),store=tx.objectStore('backups'),req=store.getAll();
        req.onsuccess=()=>{const rows=(req.result||[]).sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt));for(const row of rows.slice(8))store.delete(row.id);};
        tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve();
      });
      return true;
    }catch(e){return false}
  }).catch(()=>false);
  return idbWriteChain;
}

async function restoreFromIndexedDB(options={render:true}){
  const readCurrent=async db=>db?await new Promise(resolve=>{try{const tx=db.transaction('state','readonly');const req=tx.objectStore('state').get('current');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null)}catch(e){resolve(null)}}):null;
  const readBackups=async db=>db?await new Promise(resolve=>{try{const tx=db.transaction('backups','readonly');const req=tx.objectStore('backups').getAll();req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt)));req.onerror=()=>resolve([])}catch(e){resolve([])}}):[];
  try{
    const db=await openLifeDB();
    let rec=await readCurrent(db);
    if(!rec?.payload){const backups=await readBackups(db);rec=backups[0]||null;}
    if(!rec?.payload){const legacy=await openLegacyDB();rec=await readCurrent(legacy);try{legacy?.close()}catch(e){}}
    if(!rec?.payload)return false;
    const incoming=normalize(JSON.parse(rec.payload));
    const ls=Date.parse(state._lastSavedAt||'')||0,is=Date.parse(incoming._lastSavedAt||rec.savedAt||'')||0;
    if(is>ls){state=incoming;_persistFingerprint='';if(options.render!==false){renderAll();scheduleNative();}return true;}
  }catch(e){}
  return false;
}

_persistFingerprint=stateFingerprint();
function initPersistence(){
  try{if('BroadcastChannel' in window){syncChannel=new BroadcastChannel('life-control-v55-1');syncChannel.onmessage=ev=>{try{const incoming=normalize(JSON.parse(ev.data?.payload||'{}'));if((Date.parse(incoming._lastSavedAt||'')||0)>(Date.parse(state._lastSavedAt||'')||0)){state=incoming;renderAll();scheduleNative()}}catch(e){}}}}catch(e){}
  window.addEventListener('storage',ev=>{if(ev.key!==KEY||!ev.newValue)return;try{const incoming=normalize(JSON.parse(ev.newValue));if((Date.parse(incoming._lastSavedAt||'')||0)>(Date.parse(state._lastSavedAt||'')||0)){state=incoming;renderAll();scheduleNative()}}catch(e){}});
  try{navigator.storage?.persist?.().then(ok=>{state._persistentStorageRequestedAt=new Date().toISOString();state._persistentStorageGranted=!!ok;queueAutosave()}).catch(()=>{});}catch(e){}
}
function getStageInfo(){const m=nowMin();for(let i=0;i<state.day.steps.length;i++){const s=state.day.steps[i],st=timeToMin(s.time),endRaw=timeToMin(s.end);let en=endRaw;if(en<=st)en=i<state.day.steps.length-1?timeToMin(state.day.steps[i+1].time):1440;if(m>=st&&m<en)return {kind:'active',i,s,start:st,end:en,now:m,pct:clamp((m-st)/(en-st)*100,0,100)}}const next=state.day.steps.find(s=>timeToMin(s.time)>m);return next?{kind:'between',next,now:m,pct:0}:{kind:'after',now:m,pct:100}}
const MOTIVATIONS=[
  {author:'Пророк Мухаммад ﷺ',text:'«Поистине, дела оцениваются по намерениям, и каждому человеку — лишь то, что он намеревался совершить».',source:'Сахих аль-Бухари 1; Сахих Муслим 1907'},
  {author:'Пророк Мухаммад ﷺ',text:'«Самые любимые Аллахом дела — постоянные, даже если они малы».',source:'Сахих аль-Бухари 6464–6465; Сахих Муслим 783b'},
  {author:'Пророк Мухаммад ﷺ',text:'«Стремись к тому, что приносит тебе пользу, проси помощи у Аллаха и не проявляй беспомощности».',source:'Сахих Муслим 2664'},
  {author:'Пророк Мухаммад ﷺ',text:'«Сильный верующий лучше и более любим Аллахом, чем слабый верующий, хотя в каждом есть благо».',source:'Сахих Муслим 2664'},
  {author:'Пророк Мухаммад ﷺ',text:'«Кто верует в Аллаха и Судный день, пусть говорит благое или молчит».',source:'Сахих аль-Бухари 6018'},
  {author:'Пророк Мухаммад ﷺ',text:'«Никто из вас не уверует по-настоящему, пока не пожелает своему брату того же, чего желает себе».',source:'Сахих аль-Бухари 13; Сахих Муслим 45'},
  {author:'Пророк Мухаммад ﷺ',text:'«Облегчайте и не затрудняйте; радуйте и не отталкивайте».',source:'Сахих аль-Бухари 69; 6124'},
  {author:'Пророк Мухаммад ﷺ',text:'«Кому Аллах желает добра, тому даёт понимание религии».',source:'Сахих аль-Бухари 71'}
 ];
function motivation(){const k=keyDay();const idx=Math.floor(Date.UTC(...keyDay().split('-').map((v,i)=>i===1?Number(v)-1:Number(v)))/DAY_MS)%MOTIVATIONS.length;const info=getStageInfo();const action=info.kind==='active'?(info.s.details?.[0]||info.s.title):(info.next?.details?.[0]||info.next?.title||state.goal.next);if(state.dailyMotivations[k]?.idx===idx)return state.dailyMotivations[k];const m=MOTIVATIONS[Math.abs(idx)%MOTIVATIONS.length];const result={idx,text:`${m.text}\n\nСегодня: ${action}.`,author:m.author,source:m.source,goal:state.goal.title,action,createdAt:new Date().toISOString()};state.dailyMotivations[k]=result;saveState();return result}
function applyLayoutMode(mode,persist=true){
  mode=mode==='desktop'?'desktop':'mobile';
  const changed=state.settings?.viewMode!==mode;
  if(state.settings)state.settings.viewMode=mode;
  try{localStorage.setItem('LIFE_CONTROL_LAYOUT_V1',mode)}catch(e){}
  document.body.dataset.layout=mode;
  document.querySelectorAll('[data-layout-mode]').forEach(b=>b.classList.toggle('active',b.dataset.layoutMode===mode));
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',state.settings?.theme==='dark'?'#0d1722':'#f5f7fa');
  if(persist&&changed&&typeof saveState==='function')saveState();
}
function initLayoutMode(){
  let mode=state.settings?.viewMode||'';
  if(mode!=='mobile'&&mode!=='desktop'){
    try{mode=localStorage.getItem('LIFE_CONTROL_LAYOUT_V1')||''}catch(e){}
  }
  if(mode!=='mobile'&&mode!=='desktop')mode=window.matchMedia('(max-width:720px)').matches?'mobile':'desktop';
  applyLayoutMode(mode,false);
  document.querySelectorAll('[data-layout-mode]').forEach(b=>b.onclick=()=>applyLayoutMode(b.dataset.layoutMode,true));
  window.addEventListener('resize',()=>{try{
    if(!state.settings?.viewMode&& !localStorage.getItem('LIFE_CONTROL_LAYOUT_V1'))applyLayoutMode(window.matchMedia('(max-width:720px)').matches?'mobile':'desktop',false);
  }catch(e){}});
}
function setTheme(){document.documentElement.style.setProperty('--font-scale',String(clamp(Number(state.settings?.fontScale)||1.06,.98,1.12)));const dark=state.settings.theme==='dark';document.documentElement.dataset.theme=dark?'dark':'light';const icon=$('themeIcon');if(icon)icon.innerHTML=`<use href="${dark?'#i-sun':'#i-moon'}"></use>`;const btn=$('themeBtn');if(btn)btn.setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему');document.querySelector('meta[name="theme-color"]').setAttribute('content',dark?'#0d1722':'#f5f7fa')}
function toggleTheme(){state.settings.theme=state.settings.theme==='dark'?'light':'dark';saveState();setTheme()}
function toast(title,body=''){clearTimeout(toastTimer);$('toast').innerHTML=`<strong>${esc(title)}</strong>${body?`<div>${esc(body)}</div>`:''}`;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600)}
function logNotice(title,body){state.notificationsLog.unshift({id:uid(),title,body,at:new Date().toISOString()});state.notificationsLog=state.notificationsLog.slice(0,80);saveState();updateBell()}
let notificationAudioCtx=null;function playNotificationSound(){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;notificationAudioCtx=notificationAudioCtx||new AC();if(notificationAudioCtx.state==='suspended')notificationAudioCtx.resume().catch(()=>{});const o=notificationAudioCtx.createOscillator(),g=notificationAudioCtx.createGain(),t=notificationAudioCtx.currentTime;o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.exponentialRampToValueAtTime(1320,t+.12);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.10,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.32);o.connect(g).connect(notificationAudioCtx.destination);o.start(t);o.stop(t+.34)}catch(e){}}
function notify(title,body){logNotice(title,body);toast(title,body);playNotificationSound();if(state.settings?.notifications===false)return;try{if(window.AndroidBridge?.notify){window.AndroidBridge.notify(title,body);return}}catch(e){}try{if('Notification'in window&&Notification.permission==='granted')new Notification(title,{body,tag:'lc-'+Date.now()})}catch(e){}}
function requestNotifications(){try{if(window.AndroidBridge?.requestNotifications){state.settings.notifications=true;saveState();window.AndroidBridge.requestNotifications();scheduleNative();toast('Запрос уведомлений отправлен');return}}catch(e){}if(!('Notification'in window)){toast('Системные уведомления недоступны','История уведомлений всё равно работает внутри приложения.');return}Notification.requestPermission().then(p=>{if(p==='granted'){state.settings.notifications=true;saveState();scheduleNative();toast('Уведомления разрешены')}else toast('Уведомления не разрешены')}).catch(()=>toast('Не удалось запросить разрешение'))}
function scheduleNative(){
  try{
    if(!window.AndroidBridge?.scheduleDaily)return;
    for(const s of state.day.steps){
      window.AndroidBridge.cancelDaily?.(s.id);
      window.AndroidBridge.cancelDaily?.('pre_'+s.id);
      window.AndroidBridge.cancelDaily?.('end_'+s.id);
    }
    if(!state.settings.notifications)return;
    const preMinutes=Math.max(0,Number(state.settings.preMinutes)||0);
    for(let i=0;i<state.day.steps.length;i++){
      const s=state.day.steps[i],next=state.day.steps[i+1],previous=state.day.steps[i-1];
      const startBody=previous?`Этап «${previous.title}» завершён. Сейчас переходи к: ${s.details?.[0]||s.text||s.title}`:(s.details?.[0]||s.text||'Начни текущий этап.');
      if(!previous || previous.end!==s.time) window.AndroidBridge.scheduleDaily?.(s.id,s.time,`Пора: ${s.title}`,startBody);
      if(preMinutes>0){
        const pre=timeToMin(s.time)-preMinutes;
        if(pre>=0){
          const hh=String(Math.floor(pre/60)%24).padStart(2,'0'),mm=String(pre%60).padStart(2,'0');
          window.AndroidBridge.scheduleDaily?.('pre_'+s.id,`${hh}:${mm}`,`Через ${preMinutes} минут`,`Следующий этап: ${s.title}. Закончи текущее и переходи.`);
        }
      }
      const end=timeToMin(s.end);
      window.AndroidBridge.scheduleDaily?.('end_'+s.id,s.end,`Этап завершён: ${s.title}`,next?`Галочка будет поставлена автоматически. Следующий этап: ${next.title}.`:'Галочка будет поставлена автоматически. Основные этапы дня завершены.');
    }
  }catch(e){
    state.runtimeErrors=Array.isArray(state.runtimeErrors)?state.runtimeErrors:[];
    state.runtimeErrors.unshift({at:new Date().toISOString(),message:`Уведомления: ${String(e.message||e)}`});
    state.runtimeErrors=state.runtimeErrors.slice(0,20);
    queueAutosave();
  }
}

function autoCompleteExpiredStages(){
  const rep=dayReport(),m=nowMin();let changed=false;
  for(const s of state.day.steps||[]){const en=timeToMin(s.end);if(m>=en&&!rep.steps[s.id]){rep.steps[s.id]=true;changed=true}}
  if(changed){rep.savedAt=new Date().toISOString();saveState()}
  return changed;
}
function runScheduler(){
  const day=keyDay();
  if(day!==lastDay){lastDay=day;state._sent={};saveState();renderAll()}
  const autoDone=autoCompleteExpiredStages(),info=getStageInfo(),m=nowMin(),preMinutes=Math.max(0,Number(state.settings.preMinutes)||0);
  for(let i=0;i<state.day.steps.length;i++){
    const s=state.day.steps[i],next=state.day.steps[i+1],st=timeToMin(s.time),en=timeToMin(s.end),pre=st-preMinutes;
    const sk='s|'+day+'|'+s.id,pk='p|'+day+'|'+s.id,ek='e|'+day+'|'+s.id;
    if(m>=st&&m<st+1&&!state._sent[sk]){state._sent[sk]=true;saveState();const previous=state.day.steps[i-1];notify('Пора: '+s.title,previous?'Этап «'+previous.title+'» завершён. Сейчас: '+(s.details?.[0]||s.text||s.title):(s.details?.[0]||s.text||s.title))}
    if(preMinutes>0&&pre>=0&&m>=pre&&m<pre+1&&!state._sent[pk]){state._sent[pk]=true;saveState();notify('Через '+preMinutes+' минут','Следующий этап: '+s.title+'. Закончи текущее и переходи.')}
    if(m>=en&&m<en+1&&!state._sent[ek]){state._sent[ek]=true;saveState();notify('Этап завершён: '+s.title,next?'Галочка поставлена автоматически. Следующий этап: '+next.title:'Галочка поставлена автоматически. Основные этапы дня завершены.')}
  }
  if(autoDone)renderToday();else if(!hasTextSelection()){renderClock(info);renderAuto(info);renderTodayLight()}
}
function renderClock(info=getStageInfo()){const d=new Date();setText('clock',d.toLocaleTimeString('ru-RU',{hour12:false}));setText('clockState',info.kind==='active'?`${info.s.time}–${info.s.end}`:info.kind==='between'?'перерыв между этапами':'день завершён')}
function renderStagePercents(info=getStageInfo()){
  const now=nowMin();
  state.day.steps.forEach((s,i)=>{
    const el=$(`stagePct_${s.id}`);if(!el)return;
    const done=!!dayReport().steps?.[s.id];
    const st=timeToMin(s.time),en=timeToMin(s.end);
    let pct=0; if(done)pct=100; else if(info.kind==='active'&&info.i===i)pct=Math.round(info.pct); else if(info.kind==='after' || now>=en)pct=100;
    el.textContent=done?'100% завершено':(info.kind==='active'&&info.i===i?`${pct}% времени прошло`:now>=en?'100% завершено':'0% времени прошло');
  });
}
function renderAuto(info=getStageInfo()){let action,meta,status,pct=info.kind==='active'?info.pct:info.kind==='after'?100:0;if(info.kind==='active'){const details=info.s.details||[];action=details[0]||info.s.title;meta=`Этап ${info.i+1} · ${info.s.title} · ${info.s.time}–${info.s.end}`;status='СЕЙЧАС';const remain=Math.max(0,info.end-info.now);setText('currentProgressText',`Этап ${info.i+1} из ${state.day.steps.length} · ${Math.round(info.pct)}% времени прошло · осталось ${fmtDuration(remain)}`);const html=details.slice(1).map(x=>`<div class="detail-item"><b>•</b><span>${esc(x)}</span></div>`).join('');const cur=$('currentDetails');if(cur&&cur.innerHTML!==html)cur.innerHTML=html}else if(info.kind==='between'){action=`Подготовься: ${info.next.title}`;meta=`Следующий этап в ${info.next.time} · можно спокойно завершить текущее`;status='ПЕРЕХОД';const remain=Math.max(0,timeToMin(info.next.time)-info.now);setText('currentProgressText',`До следующего этапа · ${fmtDuration(remain)}`);setText('currentDetails','');}else{action='Отдых и сон';meta='Основные этапы дня завершены';status='ЗАКРЫТО';setText('currentProgressText','День завершён · 100% этапов по расписанию');const html='<div class="detail-item"><b>•</b><span>Отдых. Завтра продолжим с одного шага.</span></div>';const cur=$('currentDetails');if(cur&&cur.innerHTML!==html)cur.innerHTML=html}$('currentAction').textContent!==action&&setText('currentAction',action);setText('currentWindow',meta);setText('currentStatus',status);setWidth('autoProgress',pct+'%');const future=state.day.steps.map((s,i)=>({s,i})).filter(x=>timeToMin(x.s.time)>nowMin());setText('nextAlertText',future[0]?`Далее: ${future[0].s.time} · ${future[0].s.title}`:'Дальше нет — отдых');renderStagePercents(info)}
function daySum(arr,key=keyDay()){return arr.filter(x=>x.dateKey===key).reduce((a,x)=>a+Number(x.amount||0),0)}
function monthSum(arr,d=new Date()){const y=d.getFullYear(),m=d.getMonth();return arr.filter(x=>{const z=new Date(x.at);return z.getFullYear()===y&&z.getMonth()===m}).reduce((a,x)=>a+Number(x.amount||0),0)}

function dailyState(){const k=keyDay();state.daily=state.daily&&typeof state.daily==='object'?state.daily:{};state.daily[k]=state.daily[k]||{mainAction:'',mainDone:false,mode:state.dayMode||'normal'};return state.daily[k]}
function scheduleDayMetrics(){const first=state.day.steps[0],last=state.day.steps[state.day.steps.length-1];if(!first||!last)return {pct:0,start:0,end:1440,m:0};const start=timeToMin(first.time),end=Math.max(timeToMin(last.end),start+1),m=nowMin();return {pct:clamp((m-start)/(end-start)*100,0,100),start,end,m}}
function milestonePct(){const total=state.goal.milestones.length,done=state.goal.milestones.filter(m=>m.done).length;return total?Math.round(done/total*100):0}
function financePulse(){const planned=Math.max(0,Number(state.income)||0),actual=monthSum(state.profits),income=actual>0?actual:planned,payment=Math.max(0,Number(state.debts.monthlyPayment)||0),expenses=monthSum(state.expenses),cash=walletMetrics().cash;if(income<=0)return cash>0?100:0;const monthlyHealth=(income-payment-expenses)/income*100;const cashBuffer=clamp((cash/Math.max(income,1))*100,0,100);return clamp(Math.round((monthlyHealth*0.65)+(cashBuffer*0.35)),0,100)}
function debtTotal(){return Math.max(0,Number(state.debts.bank||0)+Number(state.debts.firms||0))}
function ensureDebtHistory(){state.debtHistory=Array.isArray(state.debtHistory)?state.debtHistory:[];const total=debtTotal();if(!(Number(state.debtBaseline)>0)&&total>0)state.debtBaseline=total;const k=keyDay(),last=state.debtHistory[state.debtHistory.length-1];if(!last||last.day!==k)state.debtHistory.push({day:k,total,at:new Date().toISOString()});else if(Number(last.total)!==total){last.total=total;last.at=new Date().toISOString()}state.debtHistory=state.debtHistory.slice(-120)}
function debtPulse(){const base=Number(state.debtBaseline)||0,cur=debtTotal();if(base<=0)return 0;return clamp(Math.round((1-cur/base)*100),0,100)}
function reportHasFields(r){return ['done','block','future','tomorrow'].some(k=>String(r?.[k]||'').trim())}
function goalPulse(){const m=milestonePct(),f=goalFinanceMetrics();return f.target>0?f.pct:m}
function getLifePulse(){const day=scheduleDayMetrics();return {day:Math.round(day.pct),goal:goalPulse(),finance:financePulse(),debt:debtPulse()}}
function effectiveDayMode(){const dow=new Date().getDay();if(dow===0||dow===6)return 'rest';const k=keyDay();const income=(state.profits||[]).filter(x=>x.dateKey===k).reduce((s,x)=>s+Math.max(0,Number(x.amount)||0),0);if(income>0)return 'normal';const m=nowMin(),start=timeToMin(state.day.steps?.[0]?.time||'08:30'),end=timeToMin(state.day.steps?.[state.day.steps.length-1]?.end||'22:00');return m>=start&&m<end?'heavy':'normal'}
function applyAutoDayMode(){const d=dailyState(),mode=effectiveDayMode();if(d.mode!==mode){d.mode=mode;state.dayMode=mode;saveState()}return mode}
function dayMood(){const mode=applyAutoDayMode(),income=(state.profits||[]).filter(x=>x.dateKey===keyDay()).reduce((s,x)=>s+Math.max(0,Number(x.amount)||0),0);return mode==='rest'?{emoji:'🏖️',label:'Выходной'}:income>0?{emoji:'😄',label:'Хороший день'}:{emoji:'😔',label:'Тяжёлый день'}}
function renderLifePulse(){applyAutoDayMode();const p=getLifePulse();for(const [name,val] of Object.entries(p)){const cap=name.charAt(0).toUpperCase()+name.slice(1);setText('pulse'+cap,val+'%');setWidth('pulse'+cap+'Bar',val+'%')}const d=dailyState(),modeLabel={normal:'Нормальный день',heavy:'Тяжёлый день',rest:'Выходной'}[d.mode]||'Нормальный день',tips={normal:'Работа → семья → итог. Держи одно главное действие.',heavy:'Минимум на сегодня: обязательное → один шаг по цели → итог → сон.',rest:'Выходной: восстановление, семья и одно полезное действие без гонки.'};setText('pulseNote',`Режим: ${modeLabel}. ${tips[d.mode]||tips.normal}`);const mood=dayMood();setText('pulseNote',`Режим: ${modeLabel}. ${tips[d.mode]||tips.normal}`);setText('dayMoodEmoji',mood.emoji);setText('dayMoodLabel',mood.label);const mb=$('dayMoodBadge');if(mb)mb.className='day-mood '+(mood.mode==='rest'?'rest':mood.mode==='normal'?'good':'');const sel=$('dayMode');if(sel){sel.disabled=true;sel.value=d.mode}}
function profitsBefore(dt){const t=dt?.getTime?.()||Date.now();return (state.profits||[]).reduce((a,x)=>{const z=Date.parse(x.at||'');return a+(Number.isFinite(z)&&z<=t?Math.max(0,Number(x.amount)||0):0)},0)}
function expensesBefore(dt){const t=dt?.getTime?.()||Date.now();return (state.expenses||[]).reduce((a,x)=>{const z=Date.parse(x.at||'');return a+(Number.isFinite(z)&&z<=t?Math.max(0,Number(x.amount)||0):0)},0)}
function goalDistanceMetrics(){const f=goalFinanceMetrics(),now=new Date();let daysLeft=null,requiredMonth=null,actualRate=null,variance=null;const date=f.targetDate?new Date(f.targetDate+'T23:59:59'):null;if(date&&!Number.isNaN(date.getTime())){daysLeft=Math.max(0,Math.ceil((date-now)/DAY_MS));const months=Math.max(1,daysLeft/30.4375);requiredMonth=f.remaining/months}const contributions=Array.isArray(f.contributions)?f.contributions:[];if(f.startedAt){const start=new Date(f.startedAt),elapsed=Math.max(1,(Date.now()-start.getTime())/DAY_MS);const startCapital=Math.max(0,Number(state.wallet?.openingBalance)||0)+Math.max(0,Number(state.goal?.finance?.manualSavedAmount)||0)+profitsBefore(start)-expensesBefore(start);const currentAvailable=Math.max(0,goalFinanceMetrics().available);const delta=Math.max(0,currentAvailable-Math.max(0,startCapital));actualRate=delta/elapsed;if(daysLeft!==null&&daysLeft>0){const reqDay=f.remaining/daysLeft;variance=reqDay>0?((actualRate-reqDay)/reqDay*100):100}}return {daysLeft,requiredMonth,actualRate,variance,remaining:f.remaining,complete:f.completed,targetDate:f.targetDate}}
function renderGoalDistance(){const g=goalDistanceMetrics();setText('goalDistanceDays',g.daysLeft===null?'—':g.complete?'Цель закрыта':g.daysLeft+' дн.');setText('goalDistanceMoney',fmtMoney(g.remaining));setText('goalRequiredMonth',g.requiredMonth===null?'—':fmtMoney(g.requiredMonth));setText('goalActualRate',g.actualRate===null?'—':fmtMoney(g.actualRate));setText('goalDistanceState',g.targetDate?`Срок: ${new Date(g.targetDate+'T12:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})}`:'Срок не задан');const box=$('goalTempoAlert');if(!box)return;if(g.complete){box.className='tempo-alert ok';box.textContent='Капитал собран. Следующий ориентир — сохранить результат.'}else if(g.variance===null){box.className='tempo-alert';box.textContent=g.targetDate?'Недостаточно истории накоплений для оценки темпа. Добавь пополнения — сравнение появится автоматически.':'Задай срок и фиксируй накопления, чтобы видеть требуемый темп.'}else if(g.variance<0){box.className='tempo-alert warn';box.textContent=`Темп ниже необходимого на ${Math.round(Math.abs(g.variance))}%. Нужно в среднем ${fmtMoney(g.requiredMonth)} в месяц.`}else{box.className='tempo-alert ok';box.textContent=`Темп выше необходимого примерно на ${Math.round(g.variance)}%. Текущего ритма достаточно.`}}
function openLifeAnalysis(){
  const now=Date.now(),from=now-30*DAY_MS;
  const inWindow=(at)=>{const t=new Date(at).getTime();return Number.isFinite(t)&&t>=from};
  const reports=Object.entries(state.reports||{}).filter(([day,r])=>r&&new Date(day+'T23:59:59').getTime()>=from);
  const filled=reports.filter(([,r])=>reportHasFields(r)).length;
  const stageDone30=reports.reduce((sum,[,r])=>sum+Object.values(r.steps||{}).filter(Boolean).length,0);
  const allMilestones=state.goal.milestones||[],milestonesDone=allMilestones.filter(m=>m.done).length;
  const goal=goalFinanceMetrics(),debt=debtTotal(),base=Math.max(Number(state.debtBaseline)||0,debt),debtReduced=Math.max(0,base-debt);
  const profits30=(state.profits||[]).filter(x=>inWindow(x.at));
  const expenses30=(state.expenses||[]).filter(x=>inWindow(x.at));
  const income30=profits30.reduce((a,x)=>a+Number(x.amount||0),0),expense30=expenses30.reduce((a,x)=>a+Number(x.amount||0),0),net30=income30-expense30;
  const cats=new Map();expenses30.forEach(x=>{const k=(x.category||'Другое').trim()||'Другое';cats.set(k,(cats.get(k)||0)+Number(x.amount||0))});
  const topCats=[...cats.entries()].sort((a,b)=>b[1]-a[1]);
  const srcMap=new Map(PROFIT_SOURCES.map(x=>[x,0]));profits30.forEach(x=>{const k=normalizeProfitSource(x.sourceGroup||x.source);srcMap.set(k,(srcMap.get(k)||0)+Number(x.amount||0))});
  const topSources=[...srcMap.entries()].sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>0);
  const obstacleTexts=reports.map(([,r])=>String(r.block||'').trim()).filter(Boolean);
  const uniqueObstacles=[];for(const t of obstacleTexts){if(!uniqueObstacles.some(x=>x.toLowerCase()===t.toLowerCase()))uniqueObstacles.push(t);if(uniqueObstacles.length>=3)break}
  const unresolved=allMilestones.filter(m=>!m.done).map(m=>m.title);
  const direction=net30>0?'Денежный поток за 30 дней положительный.':net30<0?'За 30 дней расходов больше, чем поступлений.':'Поток денег за 30 дней близок к нулю.';
  let advice='Сохраняй один текущий шаг и не разбрасывай внимание между несколькими направлениями.';
  if(net30<0) advice='Главный сигнал — отрицательный денежный поток. Сначала добейся, чтобы поступления устойчиво превышали расходы.';
  else if(debt>0&&debtReduced===0) advice='Главное препятствие сейчас — долг не снизился относительно стартовой отметки. Держи обязательные платежи и кассу под постоянным контролем.';
  else if(goal.remaining>0) advice=`Денежный курс ведёт к цели: до неё осталось ${fmtMoney(goal.remaining)}. Следующий шаг — продолжать накапливать из реально свободной кассы.`;
  else advice='Финансовая цель закрыта по капиталу. Следующий фокус — удержать резерв и выбрать новый ориентир.';
  const recent=uniqueObstacles.length?uniqueObstacles.map(x=>`<li>${esc(x)}</li>`).join(''):'<li>Препятствия пока не записывались.</li>';
  const catText=topCats.length?topCats.slice(0,3).map(([k,v])=>`${k} — ${fmtMoney(v)}`).join(' · '):'Расходов за 30 дней нет.';
  const sourceText=topSources.length?topSources.map(([k,v])=>`${PROFIT_ICONS[k]||'💠'} ${k} — ${fmtMoney(v)}`).join(' · '):'Поступлений за 30 дней нет.';
  const remainList=unresolved.length?unresolved.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join(''):'<li>Все этапы главной цели закрыты.</li>';
  const goalMoney=goal.target?`Собрано ${esc(fmtMoney(goal.saved))} из ${esc(fmtMoney(goal.target))} (${goal.pct}%) · осталось ${esc(fmtMoney(goal.remaining))}.`:'Сумма цели ещё не задана.';
  openModal(`<div class="close-row"><div><div class="eyebrow">Личная аналитика</div><h2>Анализ моей жизни</h2><div class="sub">Факты за последние 30 дней — без лишних деталей.</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small orange" id="aiFromAnalysisBtn"><svg class="ui-icon"><use href="#i-spark"></use></svg> AI-анализ</button><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div></div>
  <div class="analysis-list">
    <div class="analysis-item"><b><svg class="ui-icon"><use href="#i-check"></use></svg>Что уже достигнуто</b><div>${reports.length} дней с итогами · ${filled} заполненных отчёта · ${stageDone30} закрытых этапов. По цели закрыто ${milestonesDone} из ${allMilestones.length}. ${goalMoney}</div></div>
    <div class="analysis-item"><b><svg class="ui-icon"><use href="#i-money"></use></svg>Деньги</b><div>За 30 дней: пришло ${esc(fmtMoney(income30))}, ушло ${esc(fmtMoney(expense30))}, чистый результат ${esc(fmtMoney(net30))}. ${esc(direction)}</div><div style="margin-top:6px">Источники: ${esc(sourceText)}</div><div style="margin-top:4px">Основные расходы: ${esc(catText)}</div></div>
    <div class="analysis-item"><b><svg class="ui-icon"><use href="#i-arrow-down"></use></svg>Препятствия</b><div>Записей о помехах: ${obstacleTexts.length}.</div><ul style="margin:7px 0 0 18px;padding:0;color:var(--muted);font-size:10px">${recent}</ul></div>
    <div class="analysis-item"><b><svg class="ui-icon"><use href="#i-arrow-right"></use></svg>Что осталось</b><div>Долг: ${esc(fmtMoney(debt))} · Банк: ${esc(fmtMoney(state.debts.bank))} · До цели: ${esc(fmtMoney(goal.remaining))}.</div><ul style="margin:7px 0 0 18px;padding:0;color:var(--muted);font-size:10px">${remainList}</ul><div style="margin-top:6px">Следующий шаг: ${esc(state.goal.next||'Задать следующий шаг.')}</div></div>
    <div class="analysis-item"><b><svg class="ui-icon"><use href="#i-target"></use></svg>Куда ты движешься</b><div>${esc(direction)} ${goal.target?`Текущий прогресс цели — ${goal.pct}%.`:''}</div></div>
    <div class="analysis-item"><b><svg class="ui-icon"><use href="#i-spark"></use></svg>Подсказка</b><div>${esc(advice)}</div></div>
  </div>`);
  $('closeModalBtn').onclick=closeModal;$('aiFromAnalysisBtn').onclick=openGeminiAnalysis;
}

function dayIncome(dateOrKey){
  const key=typeof dateOrKey==='string'?dateOrKey:keyDay(dateOrKey);
  return (state.profits||[]).filter(x=>{const d=validDate(x.at);return d&&keyDay(d)===key}).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0)
}
function dayExpenses(dateOrKey){
  const key=typeof dateOrKey==='string'?dateOrKey:keyDay(dateOrKey);
  return (state.expenses||[]).filter(x=>{const d=validDate(x.at);return d&&keyDay(d)===key}).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0)
}
function calendarMonthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function calendarRangeMetrics(start,end){
  if(!start)return {days:0,income:0,expense:0,expenseOps:0,net:0};
  const a=new Date(start+'T12:00:00'),b=new Date((end||start)+'T12:00:00');if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return {days:0,income:0,expense:0,expenseOps:0,net:0};
  const lo=a<=b?a:b,hi=a<=b?b:a,days=Math.max(1,Math.floor((hi-lo)/DAY_MS)+1);let income=0,expense=0,expenseOps=0;
  for(let i=0;i<days;i++){const d=new Date(lo);d.setDate(lo.getDate()+i);const k=keyDay(d);income+=dayIncome(k);expense+=dayExpenses(k);expenseOps+=(state.expenses||[]).filter(x=>{const z=validDate(x.at);return z&&keyDay(z)===k}).length}
  return {days,income,expense,expenseOps,net:income-expense};
}
function renderCalendar(year,month,selectedKey){
  const first=new Date(year,month,1),last=new Date(year,month+1,0),days=last.getDate(),monthTitle=first.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}),leading=(first.getDay()+6)%7;
  const earned=[];for(let day=1;day<=days;day++){const d=new Date(year,month,day),key=keyDay(d),income=dayIncome(key);if(income>0)earned.push({day,key,income})}
  const total=earned.reduce((s,x)=>s+x.income,0),earnedDays=earned.length,best=earned.reduce((m,x)=>x.income>m?x.income:m,0);
  let selected=selectedKey||keyDay(new Date());if(!selected.startsWith(calendarMonthKey(first)))selected=keyDay(first);
  const selectedDate=new Date(selected+'T12:00:00'),selectedIn=dayIncome(selected),selectedOut=dayExpenses(selected);
  const selectedProfits=(state.profits||[]).filter(x=>{const d=validDate(x.at);return d&&keyDay(d)===selected}).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const selectedSources={};selectedProfits.forEach(x=>{const k=normalizeProfitSource(x.sourceGroup||x.source);selectedSources[k]=(selectedSources[k]||0)+Math.max(0,Number(x.amount)||0)});
  const sourceRows=Object.entries(selectedSources).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div class="calendar-source"><span>'+esc(PROFIT_ICONS[k]||'💠')+' '+esc(k)+'</span><strong class="blue">+'+esc(fmtMoney(v))+'</strong></div>').join('');
  const rs=calendarRangeStart,re=calendarRangeEnd,rangeActive=!!rs,rangeLo=rs&&re?(rs<re?rs:re):rs,rangeHi=rs&&re?(rs<re?re:rs):rs,range=calendarRangeMetrics(rangeLo,rangeHi);
  const week=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];let cells=week.map(w=>'<div class="calendar-week">'+w+'</div>').join('');
  for(let i=0;i<leading;i++)cells+='<div class="calendar-day empty" aria-hidden="true"></div>';
  for(let day=1;day<=days;day++){const d=new Date(year,month,day),key=keyDay(d),income=dayIncome(key),today=key===keyDay(new Date()),sel=key===selected,inRange=rangeActive&&rangeLo&&rangeHi&&key>=rangeLo&&key<=rangeHi,start=key===rangeLo&&rangeActive,end=key===rangeHi&&rangeActive;cells+='<button class="calendar-day '+(income>0?'earned ':'')+(today?'today ':'')+(sel?'selected ':'')+(inRange?'in-range ':'')+(start?'range-start ':'')+(end?'range-end':'')+'" type="button" data-cal-day="'+key+'" aria-label="'+esc(d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}))+'"><span class="calendar-num">'+day+'</span>'+(income>0?'<span class="calendar-earned">'+esc(fmtMoney(income))+'</span>':'<span class="calendar-day-noearn">—</span>')+'</button>'}
  const rangeLabel=!rangeActive?'Задай период ниже':(!calendarRangeEnd?'Теперь выбери последнюю дату':range.days+' дн. · '+rangeLo+' → '+rangeHi);
  const rangeSummary=rangeActive&&calendarRangeEnd?'<div class="calendar-range-summary"><div class="calendar-kpi"><div class="label">Дней</div><div class="value">'+range.days+'</div></div><div class="calendar-kpi"><div class="label">Прибыль</div><div class="value blue">+'+esc(fmtMoney(range.income))+'</div></div><div class="calendar-kpi"><div class="label">Потрачено</div><div class="value red-txt">−'+esc(fmtMoney(range.expense))+'</div></div><div class="calendar-kpi"><div class="label">Чистый итог</div><div class="value '+(range.net>=0?'orange-txt':'red-txt')+'">'+(range.net>=0?'+':'−')+esc(fmtMoney(Math.abs(range.net)))+'</div></div></div>':'';
  const y=new Date().getFullYear(),defaultStart=calendarRangeStart||y+'-01-01',defaultEnd=calendarRangeEnd||keyDay(new Date());
  const modal='<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-calendar"></use></svg></span>Финансовый календарь</div><h2>Доходы и расходы по периоду</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="calendar-modal" style="margin-top:12px"><div class="calendar-range-bar" style="margin-top:0;display:grid;grid-template-columns:1fr 1fr auto;align-items:end"><div class="field"><label>От</label><input id="calStartDate" type="date" value="'+esc(defaultStart)+'"></div><div class="field"><label>До</label><input id="calEndDate" type="date" value="'+esc(defaultEnd)+'"></div><button class="btn small primary" id="calApplyRange" type="button"><svg class="ui-icon"><use href="#i-check"></use></svg> Рассчитать</button></div><div class="calendar-range-actions" style="margin-top:8px"><button class="btn small" id="calYearBtn" type="button">С 1 января</button><button class="btn small" id="calTodayBtn" type="button">До сегодня</button><button class="btn small ghost" id="calRangeClear" type="button">Очистить</button></div><div class="calendar-head" style="margin-top:12px"><div class="calendar-month">'+esc(monthTitle)+'</div><div class="calendar-nav"><button class="iconbtn" id="calPrev" type="button" aria-label="Предыдущий месяц">‹</button><button class="iconbtn" id="calNext" type="button" aria-label="Следующий месяц">›</button></div></div><div class="calendar-summary"><div class="calendar-kpi"><div class="label">Дней с доходом</div><div class="value">'+earnedDays+'</div></div><div class="calendar-kpi"><div class="label">Заработано за месяц</div><div class="value blue">'+esc(fmtMoney(total))+'</div></div><div class="calendar-kpi"><div class="label">Лучший день</div><div class="value orange">'+esc(fmtMoney(best))+'</div></div></div><div class="calendar-grid">'+cells+'</div><div class="calendar-range-bar"><span><strong>Период:</strong> '+esc(rangeLabel)+'</span></div>'+rangeSummary+'<div class="calendar-selected"><h3>'+esc(selectedDate.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))+'</h3><div class="meta">Доход: <strong class="blue">+'+esc(fmtMoney(selectedIn))+'</strong> · Расход: <strong class="red-txt">−'+esc(fmtMoney(selectedOut))+'</strong></div><div class="stack" style="margin-top:8px">'+(sourceRows||'<div class="empty">В этот день доходов не зафиксировано.</div>')+'</div></div><div class="calendar-foot">Можно указать любой период, например <strong>01.01.2026 → 19.09.2026</strong>. Система считает только реально записанные операции.</div></div>';
  openModal(modal);$('closeModalBtn').onclick=closeModal;
  const apply=()=>{const a=$('calStartDate').value,b=$('calEndDate').value;if(!a){toast('Укажи начальную дату');return}if(b&&b<a){calendarRangeStart=b;calendarRangeEnd=a}else{calendarRangeStart=a;calendarRangeEnd=b||a}renderCalendar(year,month,selected)};
  $('calApplyRange').onclick=apply;$('calYearBtn').onclick=()=>{calendarRangeStart=new Date().getFullYear()+'-01-01';calendarRangeEnd=keyDay(new Date());renderCalendar(year,month,selected)};$('calTodayBtn').onclick=()=>{calendarRangeEnd=keyDay(new Date());if(!calendarRangeStart)calendarRangeStart=calendarRangeEnd;renderCalendar(year,month,selected)};$('calRangeClear').onclick=()=>{calendarRangeStart='';calendarRangeEnd='';renderCalendar(year,month,selected)};
  $('calPrev').onclick=()=>{const nd=new Date(year,month-1,1);renderCalendar(nd.getFullYear(),nd.getMonth(),selected)};$('calNext').onclick=()=>{const nd=new Date(year,month+1,1);renderCalendar(nd.getFullYear(),nd.getMonth(),selected)};
  $$('[data-cal-day]').forEach(b=>b.onclick=()=>{const k=b.dataset.calDay;selected=k;if(!calendarRangeStart||calendarRangeEnd){calendarRangeStart=k;calendarRangeEnd=''}else if(k<calendarRangeStart){calendarRangeEnd=calendarRangeStart;calendarRangeStart=k}else{calendarRangeEnd=k}renderCalendar(year,month,k)});
}
function openCalendar(){const d=new Date();calendarRangeStart=d.getFullYear()+'-01-01';calendarRangeEnd=keyDay(d);renderCalendar(d.getFullYear(),d.getMonth(),keyDay(d))}

function renderControlDashboard(){
  const wm=walletMetrics(), debt=debtTotal(), f=goalFinanceMetrics(), rep=dayReport();
  const steps=state.day.steps||[], completed=steps.filter(x=>!!rep.steps?.[x.id]).length;
  const discipline=steps.length?Math.round(completed/steps.length*100):0;
  const monthIncome=monthSum(state.profits||[]), monthExpense=monthSum(state.expenses||[]), monthNet=monthIncome-monthExpense;
  const payment=Math.max(0,Number(state.debts?.monthlyPayment)||0);
  const paymentShare=monthIncome>0?Math.round(payment/monthIncome*100):0;
  const remainingDays=f.targetDate?Math.max(0,Math.ceil((new Date(f.targetDate+'T12:00:00').getTime()-Date.now())/DAY_MS)):0;
  setText('dashCash',fmtMoney(wm.cash));
  setText('dashCashMeta','Общий капитал: '+fmtMoney(wm.capital));
  setText('dashDebt',fmtMoney(debt));
  setText('dashDebtMeta',payment?'Платёж / месяц: '+fmtMoney(payment):'Платёж не задан');
  setText('dashGoal',f.target?f.pct+'%':'—');
  setText('dashGoalMeta',f.target?'Осталось: '+fmtMoney(f.remaining):'Сумма цели не задана');
  setText('dashDiscipline',discipline+'%');
  setText('dashDisciplineMeta',completed+' из '+steps.length+' этапов сегодня');
  const pressure=payment>0&&monthIncome>0?'Платёж составляет около '+paymentShare+'% месячного дохода. Чистый результат месяца: '+fmtMoney(monthNet)+'.':debt>0?'Обязательства: '+fmtMoney(debt)+'. Зафиксируй обязательный платёж, чтобы система могла контролировать нагрузку.':'Обязательства не заданы.';
  setText('dashFinancialTitle',debt>0?'Финансовая нагрузка':'Финансовый резерв');
  setText('dashFinancialText',pressure);
  let priority=state.goal.next||'Определи один следующий измеримый шаг по главной цели.';
  let priorityText=f.target?'Цель: '+fmtMoney(f.available)+' из '+fmtMoney(f.target)+(remainingDays?' · до даты цели '+remainingDays+' дн.':''):'Задай сумму и срок главной цели.';
  const inf=infoForDashboard();
  if(inf&&inf.kind==='active'){priority=steps[inf.i]?.title||priority;priorityText='Текущий этап '+(inf.i+1)+' из '+steps.length+': '+(steps[inf.i]?.time||'')+'–'+(steps[inf.i]?.end||'')+'.';}
  setText('dashPriorityTitle',priority);
  setText('dashPriorityText',priorityText);
  setText('controlUpdated',new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));
}
function infoForDashboard(){try{return getStageInfo()}catch(e){return null}}function dayProgressMetrics(){
  const steps=state.day.steps||[];if(!steps.length)return {pct:0,elapsed:0,remaining:0,stageIndex:-1,stage:'—',sleepAt:'—'};
  const start=timeToMin(steps[0].time),sleep=timeToMin(steps[steps.length-1].end),now=nowMin(),span=Math.max(1,sleep-start),elapsed=clamp(now-start,0,span),pct=clamp(Math.round(elapsed/span*100),0,100);
  const info=getStageInfo();let remaining=0;if(now<start)remaining=sleep-start;else if(now<sleep)remaining=sleep-now;
  return {pct,elapsed,remaining,stageIndex:info.kind==='active'?info.i:info.kind==='between'?steps.findIndex(s=>s.id===info.next?.id):steps.length-1,stage:info.kind==='active'?info.s.title:info.kind==='between'?info.next?.title:'Сон / завершение дня',sleepAt:steps[steps.length-1].end};
}
function updateDayProgressModal(){
  const p=dayProgressMetrics(),modal=$('dayProgressModal');if(!modal)return;modal.style.setProperty('--runner-progress',p.pct);setText('dayProgressPercent',p.pct+'%');setText('dayProgressPassed',p.pct+'% пройдено');setText('dayProgressLeft',(100-p.pct)+'% осталось');setText('dayProgressElapsed',fmtDuration(p.elapsed));setText('dayProgressRemain',p.remaining>0?fmtDuration(p.remaining):'День завершён');setText('dayProgressStage',p.stageIndex>=0?'Этап '+(p.stageIndex+1)+' из '+(state.day.steps.length||0):'До начала дня');setText('dayProgressSleep',p.sleepAt);
}
function openDayProgress(){
  openModal('<div class="close-row"><div><div class="eyebrow"><svg class="ui-icon"><use href="#i-runner"></use></svg> Ход дня</div><h2>От начала дня до сна</h2><div class="sub">Процент считается по реальному расписанию и обновляется каждую секунду.</div></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div id="dayProgressModal" style="margin-top:12px"><div class="day-progress-main"><div class="day-progress-percent" id="dayProgressPercent">0%</div><div class="day-progress-sub" id="dayProgressPassed">0% пройдено</div></div><div class="runner-stage"><div class="runner-track"><div class="runner-runner"><svg class="ui-icon"><use href="#i-runner"></use></svg></div></div></div><div class="day-progress-kpis"><div class="day-progress-kpi"><div class="label">Прошло</div><div class="value" id="dayProgressElapsed">0 мин</div></div><div class="day-progress-kpi"><div class="label">Осталось до сна</div><div class="value" id="dayProgressRemain">0 мин</div></div><div class="day-progress-kpi"><div class="label">Текущий этап</div><div class="value" id="dayProgressStage">—</div></div></div><div class="card" style="margin-top:10px;background:var(--soft);padding:12px"><div class="row"><span class="small muted">Сон / завершение дня</span><strong id="dayProgressSleep">—</strong></div><div class="sub" id="dayProgressLeft" style="margin-top:5px">100% осталось</div></div></div>');
  $('closeModalBtn').onclick=closeModal;updateDayProgressModal();clearInterval(dayProgressTimer);dayProgressTimer=setInterval(updateDayProgressModal,1000);
}

function renderToday(){
  autoCompleteExpiredStages();renderTodayLight();renderControlDashboard();const d=new Date(),info=getStageInfo(),rep=dayReport(),dd=dailyState();
  $('todayTitle').textContent=d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});$('todayDate').textContent=fmtDate(d);
  const mo=motivation();$('motivationText').textContent=mo.text;$('motivationSource').textContent=`${mo.author} — ${mo.source}`;
  renderClock(info);renderAuto(info);renderLifePulse();setText('dayCompletion',`${Object.values(rep.steps||{}).filter(Boolean).length} / ${state.day.steps.length}`);
  const future=state.day.steps.map((s,i)=>({s,i})).filter(x=>x.i>(info.kind==='active'?info.i:-1));
  autoCompleteExpiredStages();const effectiveRep=dayReport();$('timeline').innerHTML=state.day.steps.map((s,i)=>{const expired=nowMin()>=timeToMin(s.end),done=!!effectiveRep.steps[s.id]||expired,current=info.kind==='active'&&info.i===i;const stagePct=done?100:(current?Math.round(info.pct):0);const icon=done?'i-check':(current?'i-play':'i-calendar');return `<div class="timeline-row ${current?'current':''} ${done?'done':''}"><div class="time-range">${esc(s.time)}<br>${esc(s.end)}</div><div><div class="t-title"><span class="stage-icon" aria-hidden="true"><svg class="ui-icon"><use href="#${icon}"></use></svg></span>Этап ${i+1} · ${esc(s.title)}</div><div class="t-note">${esc(s.text)}</div><div class="stage-pct">${done?'100% завершено':current?`${stagePct}% времени прошло`:'0% времени прошло'}</div></div><input class="check" type="checkbox" data-day-step="${esc(s.id)}" ${done?'checked':''} ${expired?'disabled':''} aria-label="${done?'Этап завершён: '+s.title:'Завершить этап: '+s.title}"></div>`}).join('');
  $('[data-day-step]').forEach(c=>{if(c.checked&&!c.disabled)c.classList.add('auto-complete-anim');c.onchange=()=>{rep.steps[c.dataset.dayStep]=c.checked;saveState();renderToday()}});
  $('nextList').innerHTML=future.length?future.map(x=>`<div class="future-item"><div class="step-no">${x.i+1}</div><div><div class="future-title">${esc(x.s.title)}</div><div class="future-time">${esc(x.s.time)}–${esc(x.s.end)}</div></div><div class="future-arrow">→</div></div>`).join(''):'<div class="empty">После последнего этапа — отдых.</div>';
  $('miniGoal').textContent=state.goal.title;$('miniNext').textContent=state.goal.next;$('todayBalance').textContent=fmtMoney(daySum(state.profits)-daySum(state.expenses));const wm=walletMetrics();setText('todayGoalSaved',`На цель: ${fmtMoney(wm.goal)}`);setText('todayCashState',`Касса: ${fmtMoney(wm.cash)} · Общий капитал: ${fmtMoney(wm.capital)}`);
  for(const k of ['done','block','future','tomorrow']){const el=$('r'+k[0].toUpperCase()+k.slice(1));if(el&&document.activeElement!==el)el.value=rep[k]||''}
  $('reportSaved').textContent=rep.savedAt?`Сохранено ${fmtDateTime(new Date(rep.savedAt))}`:'Не сохранено';
}

function renderTodayLight(){const d=new Date();$('clock').textContent=d.toLocaleTimeString('ru-RU',{hour12:false})}
function goalContributionTotal(f){return (Array.isArray(f.contributions)?f.contributions:[]).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0)}
function syncGoalFinanceCompletion(){
  const f=state.goal.finance;
  f.contributions=Array.isArray(f.contributions)?f.contributions:[];
  const target=Math.max(0,Number(f.targetAmount)||0);
  let baseline=Math.max(0,Number(f.manualSavedAmount));
  if(!Number.isFinite(baseline)||baseline<0)baseline=0;
  const contrib=goalContributionTotal(f);
  const total=Math.max(0,baseline+contrib);
  f.savedAmount=target>0?Math.min(target,total):total;
  if((target>0||f.savedAmount>0)&&!f.startedAt)f.startedAt=new Date().toISOString();
  if(target>0 && f.savedAmount>=target){
    f.savedAmount=target;
    if(!f.completedAt)f.completedAt=new Date().toISOString();
  }else f.completedAt='';
}
function goalFinanceMetrics(){return FinanceEngine.goal()}

function computeCashFromState(savedOverride=null){
  const opening=Math.max(0,Number(state.wallet?.openingBalance)||0);
  const historicalGoal=Math.max(0,Number(state.goal?.finance?.manualSavedAmount)||0);
  const income=totalProfitAll();
  const expense=totalExpenseAll();
  const saved=savedOverride===null?Math.max(0,Number(state.goal?.finance?.savedAmount)||0):Math.max(0,Number(savedOverride)||0);
  const capital=opening+historicalGoal+income-expense;
  return capital-saved;
}

function svgLineChart(pointsActual, pointsPlan, target, labels, yFormatter, tooltipFormatter=yFormatter){
  const W=640,H=230,L=62,R=16,T=16,B=38,iw=W-L-R,ih=H-T-B;
  const allVals=[...pointsActual,...pointsPlan,...(target>0?[target]:[])].map(Number).filter(Number.isFinite);
  const max=Math.max(1,...allVals);
  const x=i=>L+(labels.length<=1?iw/2:(i/(labels.length-1))*iw);
  const y=v=>T+ih-(Number(v)/max)*ih;
  const segmentPaths=(arr)=>{const segs=[];let cur=[];arr.forEach((v,i)=>{if(Number.isFinite(Number(v))){cur.push([i,Number(v)])}else if(cur.length){segs.push(cur);cur=[]}});if(cur.length)segs.push(cur);return segs.map(seg=>seg.map(([i,v],j)=>`${j?'L':'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')).join('|')};
  let svg=`<svg class="lc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Динамика">${[0,25,50,75,100].map(p=>{const yy=T+ih-(p/100)*ih;return `<line class="lc-grid" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="lc-axis" x="${L-8}" y="${yy+3}" text-anchor="end">${esc(yFormatter(max*p/100))}</text>`}).join('')}`;
  if(target>0){const yy=y(target);svg+=`<line class="lc-target" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="lc-axis" x="${W-R}" y="${yy-5}" text-anchor="end">Цель ${esc(yFormatter(target))}</text>`}
  labels.forEach((lab,i)=>{if(labels.length<=7||i===0||i===labels.length-1||i%2===0)svg+=`<text class="lc-axis" x="${x(i)}" y="${H-10}" text-anchor="middle">${esc(lab)}</text>`});
  const aPaths=segmentPaths(pointsActual).split('|').filter(Boolean),pPaths=segmentPaths(pointsPlan).split('|').filter(Boolean);
  pPaths.forEach(d=>svg+=`<path class="lc-plan" d="${d}"/>`);aPaths.forEach(d=>svg+=`<path class="lc-actual" d="${d}"/>`);
  pointsActual.forEach((v,i)=>{if(Number.isFinite(Number(v)))svg+=`<circle class="lc-dot actual" cx="${x(i)}" cy="${y(v)}" r="3.6"><title>${esc(labels[i]||'')} · ${esc(tooltipFormatter(v))}</title></circle>`});
  pointsPlan.forEach((v,i)=>{if(Number.isFinite(Number(v)))svg+=`<circle class="lc-dot plan" cx="${x(i)}" cy="${y(v)}" r="2.8"><title>${esc(labels[i]||'')} · план ${esc(tooltipFormatter(v))}</title></circle>`});
  svg+='</svg>';return svg;
}
function fmtAxisMoney(v){return Number(v||0).toLocaleString('ru-RU')}
function dateKeyFromDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function shortDateLabel(iso){const d=new Date(iso+'T12:00:00');return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`}
function aggregateByDay(items, days){
  const map=new Map();
  for(const it of items||[]){const at=new Date(it.at);if(Number.isNaN(at.getTime()))continue;map.set(dateKeyFromDate(at),(map.get(dateKeyFromDate(at))||0)+(Number(it.amount)||0))}
  const out=[],today=new Date(); today.setHours(0,0,0,0);
  for(let i=days-1;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);const k=dateKeyFromDate(d);out.push({day:k,value:map.get(k)||0,label:`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`})}
  return out;
}
function goalChartData(){
  const f=state.goal.finance||{},target=Math.max(0,Number(f.targetAmount)||0);
  if(target<=0)return null;
  const start=f.startedAt?new Date(f.startedAt):new Date();
  start.setHours(0,0,0,0);
  const today=new Date();today.setHours(0,0,0,0);
  let end=f.targetDate?new Date(f.targetDate+'T12:00:00'):new Date(today);
  if(Number.isNaN(end.getTime()))end=new Date(today);end.setHours(0,0,0,0);
  if(end<today)end=new Date(today);
  if(end<start)end=new Date(start);
  const spanDays=Math.max(1,Math.round((end-start)/DAY_MS));
  const slots=Math.min(16,Math.max(7,spanDays+1));
  const labels=[],actual=[],plan=[];
  const opening=Math.max(0,Number(state.wallet?.openingBalance)||0);
  const historicalGoal=Math.max(0,Number(f.manualSavedAmount)||0);
  const profits=[...(state.profits||[])].map(x=>({d:new Date(x.at),a:Math.max(0,Number(x.amount)||0)})).filter(x=>!Number.isNaN(x.d.getTime()));
  const expenses=[...(state.expenses||[])].map(x=>({d:new Date(x.at),a:Math.max(0,Number(x.amount)||0)})).filter(x=>!Number.isNaN(x.d.getTime()));
  const startCapital=opening+historicalGoal;
  const capitalAt=d=>Math.max(0,startCapital+profits.filter(x=>x.d<=d).reduce((s,x)=>s+x.a,0)-expenses.filter(x=>x.d<=d).reduce((s,x)=>s+x.a,0));
  for(let i=0;i<slots;i++){
    const ratio=slots===1?1:i/(slots-1);
    let d=new Date(start.getTime()+spanDays*ratio*DAY_MS);d.setHours(23,59,59,999);
    labels.push(`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`);
    actual.push(d<=today?Math.min(target,capitalAt(d)):null);
    const planStart=Math.min(target,startCapital);
    plan.push(Math.min(target,planStart+(target-planStart)*ratio));
  }
  // Guarantee the latest visible actual point represents today's real capital when the sampling grid lands before today.
  if(actual.length){
    let latest=-1;for(let i=0;i<actual.length;i++)if(actual[i]!==null)latest=i;
    if(latest>=0)actual[latest]=Math.min(target,goalFinanceMetrics().available);
  }
  return {target,labels,actual,plan,startDate:start,endDate:end};
}

function renderGoalChart(){
  const box=$('goalChart'); if(!box)return;
  const data=goalChartData();
  if(!data){box.innerHTML='<div class="lc-chart-empty">Задай сумму цели — здесь появится реальная динамика накопления.</div>';setText('goalChartStatus','Нет суммы');return}
  box.innerHTML=svgLineChart(data.actual,data.plan,data.target,data.labels,v=>fmtAxisMoney(v),v=>fmtMoney(v));
  const f=goalFinanceMetrics();
  setText('goalChartStatus',f.target?`Доступно к цели ${f.pct}%`:'—');
}
function renderMoneyFlowChart(){
  const box=$('moneyFlowChart');if(!box)return;
  const p=aggregateByDay(state.profits,14),e=aggregateByDay(state.expenses,14),labels=p.map(x=>x.label),pa=p.map(x=>x.value),ea=e.map(x=>x.value),maxSum=pa.concat(ea).reduce((m,v)=>Math.max(m,v),0);
  if(maxSum<=0){box.innerHTML='<div class="lc-chart-empty">После первых операций здесь появится движение денег по дням.</div>'}else{
    // Reuse generic SVG with two lines; target is not needed.
    box.innerHTML=svgLineChart(pa,ea,0,labels,v=>fmtAxisMoney(v),v=>fmtMoney(v));
  }
  const pp=pa.reduce((a,b)=>a+b,0),ee=ea.reduce((a,b)=>a+b,0);
  setText('flowProfit14',fmtMoney(pp));setText('flowExpense14',fmtMoney(ee));setText('flowNet14',fmtMoney(pp-ee));
}
const CHART_PALETTE=['#2479ad','#da8441','#6ba36a','#8c6aa8','#5f7b8c','#c39b33','#b85c5c'];
function renderExpenseDonut(){
  const box=$('expenseDonut'),legend=$('expenseLegend');if(!box||!legend)return;
  const nowLocal=new Date();const month=dateKeyFromDate(nowLocal).slice(0,7);
  const map=new Map();
  for(const e of state.expenses||[]){const d=new Date(e.at);if(Number.isNaN(d.getTime())||dateKeyFromDate(d).slice(0,7)!==month)continue;const k=(e.category||'Без категории').trim()||'Без категории';map.set(k,(map.get(k)||0)+(Number(e.amount)||0))}
  const rows=[...map.entries()].sort((a,b)=>b[1]-a[1]);const total=rows.reduce((a,[,v])=>a+v,0);
  if(total<=0){box.style.background='var(--line)';$('expenseDonutCenter').innerHTML='<div>Нет<br>расходов</div>';legend.innerHTML='';setText('expenseChartNote','В этом месяце расходы ещё не записаны.');return}
  let angle=0;const stops=[];
  rows.slice(0,6).forEach(([k,v],i)=>{const deg=v/total*360;const color=CHART_PALETTE[i%CHART_PALETTE.length];stops.push(`${color} ${angle}deg ${angle+deg}deg`);angle+=deg});
  const other=rows.slice(6).reduce((a,[,v])=>a+v,0);if(other>0){const deg=other/total*360;const color=CHART_PALETTE[6];stops.push(`${color} ${angle}deg ${angle+deg}deg`)}
  box.style.background=`conic-gradient(${stops.join(',')})`;
  $('expenseDonutCenter').innerHTML=`<div><b>${esc(fmtMoney(total))}</b>Месяц</div>`;
  const legendRows=rows.slice(0,6).map(([k,v],i)=>{const pct=Math.round(v/total*100),color=CHART_PALETTE[i%CHART_PALETTE.length];return `<div class="legend-row"><i class="legend-dot" style="background:${color}"></i><span class="legend-name">${esc(k)}</span><span class="legend-val">${esc(fmtMoney(v))} · ${pct}%</span></div>`});
  if(other>0)legendRows.push(`<div class="legend-row"><i class="legend-dot" style="background:${CHART_PALETTE[6]}"></i><span class="legend-name">Другое</span><span class="legend-val">${esc(fmtMoney(other))} · ${Math.round(other/total*100)}%</span></div>`);
  legend.innerHTML=legendRows.join('');
  setText('expenseChartNote',`Всего расходов за месяц: ${fmtMoney(total)}.`);
}
function renderProfitSources(){
  const list=$('profitSourceList');if(!list)return;
  const map=new Map(PROFIT_SOURCES.map(s=>[s,0]));
  for(const p of state.profits||[]){const raw=String(p.sourceGroup||p.source||'').trim();const k=normalizeProfitSource(raw);map.set(k,(map.get(k)||0)+(Number(p.amount)||0))}
  const rows=PROFIT_SOURCES.map(k=>[k,map.get(k)||0]);const total=rows.reduce((a,[,v])=>a+v,0);
  list.innerHTML=rows.map(([k,v])=>{const pct=total>0?Math.round(v/total*100):0;return `<div class="source-row"><div><div class="source-name"><span class="source-ico">${esc(PROFIT_ICONS[k]||'💠')}</span>${esc(k)}</div><div class="source-track"><i class="source-fill" style="width:${pct}%"></i></div></div><div class="source-val">${esc(fmtMoney(v))} <span class="small muted">${pct}%</span></div></div>`}).join('');
  setText('profitSourceNote',total?`Три источника считаются из всех сохранённых поступлений: ${fmtMoney(total)}.`:'Три источника готовы к учёту: зарплата, фриланс и спортивная аналитика.');
}
function renderMoneyCharts(){renderMoneyFlowChart();renderExpenseDonut();renderProfitSources()}

function goalAIKey(){
  const g=state.goal||{},f=g.finance||{};
  return [g.title,g.why,g.next,f.targetAmount||0,f.targetDate||'',(g.milestones||[]).map(m=>m.title+':'+(m.done?'1':'0')).join('|')].join('||');
}
function renderGoalAI(){
  const g=state.goal||{},plan=g.aiPlan,key=goalAIKey(),stateEl=$('goalAiState'),summary=$('goalAiSummary'),list=$('goalAiPlan');
  if(!stateEl||!summary||!list)return;
  if(!String(g.title||'').trim()){stateEl.textContent='Сначала задай цель.';summary.textContent='';list.innerHTML='';return}
  if(!plan){stateEl.textContent='AI-план ещё не сформирован. После сохранения цели он запускается автоматически.';summary.textContent='AI покажет: что уже достигнуто, что уже есть и что конкретно делать дальше.';list.innerHTML='';return}
  if(plan.goalKey!==key){stateEl.textContent='Цель изменена — нужен новый AI-план.';summary.textContent='Сохрани новую формулировку цели и обнови AI.';list.innerHTML='';return}
  stateEl.textContent=plan.at?'Обновлено '+fmtDateTime(new Date(plan.at)):'AI-план готов';summary.textContent=plan.summary||'';
  list.innerHTML=(Array.isArray(plan.actions)?plan.actions:[]).map((x,i)=>'<div class="goal-ai-item"><div><span class="goal-ai-badge">'+esc(x.priority||('P'+(i+1)))+'</span> '+esc(x.action||'Действие')+'</div><div>'+esc(x.deadline||'Срок не указан')+' · '+esc(x.result||'Измеримый результат не указан')+'</div></div>').join('')||'<div class="empty">AI не вернул структурированный план. Нажми «Обновить AI».</div>';
}
function parseGoalAI(text){
  const raw=String(text||'').trim(),actions=[],lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  for(const line of lines){const m=line.match(/\b(P[123])\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)(?:\|\s*(.*))?/i);if(m)actions.push({priority:m[1].toUpperCase(),action:m[2].trim(),deadline:m[3].trim(),result:m[4].trim(),basis:(m[5]||'').trim()})}
  const summary=raw.split(/\n/).filter(x=>/ТЕКУЩЕЕ СОСТОЯНИЕ|ГЛАВНАЯ ПРОБЛЕМА|ЧТО УЖЕ ДОСТИГНУТО|ЧТО УЖЕ ЕСТЬ|ГЛАВНЫЙ ФОКУС/i.test(x)).slice(0,6).join('\n');
  return {summary:summary||raw.slice(0,1200),actions:actions.slice(0,5),raw};
}
async function requestGoalAI(force=false){
  if(goalAiBusy||state.ai?.enabled===false||!cloudAuth()?.access_token)return;
  const key=goalAIKey();if(!force&&state.goal.aiPlan?.goalKey===key)return;
  goalAiBusy=true;const stateEl=$('goalAiState'),summary=$('goalAiSummary');
  if(stateEl)stateEl.textContent='AI строит план по текущей цели…';
  if(summary)summary.textContent='Собираю факты: прогресс, капитал, деньги, долги, результаты и ближайший шаг.';
  try{
    const data=await callAI({mode:'goal',scope:{goal:true,money:true,reports:true,notes:false,webSearch:false}});
    const parsed=parseGoalAI(data.output_text||'');
    state.goal.aiPlan={goalKey:key,at:new Date().toISOString(),summary:parsed.summary,actions:parsed.actions,raw:parsed.raw};
    state.goal.aiPlanAt=state.goal.aiPlan.at;state.goal.aiPlanGoalKey=key;saveState();if(cloudAuth())cloudPush().catch(()=>{});renderGoalAI();toast('AI-план цели готов','Система показала, что уже есть и что делать дальше.');
  }catch(e){if(stateEl)stateEl.textContent='AI сейчас недоступен';if(summary)summary.textContent=String(e?.message||e||'Неизвестная ошибка AI.')}
  finally{goalAiBusy=false}
}
function renderGoal(){
  syncGoalFinanceCompletion();
  const total=state.goal.milestones.length,done=state.goal.milestones.filter(m=>m.done).length,p=total?Math.round(done/total*100):0;
  setText('goalTitle',state.goal.title);setText('goalWhy',state.goal.why);setText('goalPct',p+'%');setWidth('goalBar',p+'%');setText('goalNext',state.goal.next);setText('goalCount',`${done} / ${total}`);
  const f=goalFinanceMetrics();
  setText('goalTargetAmount',fmtMoney(f.target));setText('goalSavedAmount',fmtMoney(f.saved));setText('goalCashAmount',fmtMoney(f.cash));setText('goalRemainingAmount',fmtMoney(f.remaining));setText('goalFinancePct',f.target?`${f.pct}%`:'—');setWidth('goalFinanceBar',f.pct+'%');
  const potentialPct=f.target?f.pct:0;
  if($('goalColumnFill'))$('goalColumnFill').style.height=potentialPct+'%';
  setText('goalColumnPct',f.target?`${potentialPct}%`:'0%');setText('goalColumnSaved',fmtMoney(f.saved));setText('goalColumnCash',fmtMoney(f.cash));
  setText('goalFinanceStatus',f.target?(f.completed?'Текущего капитала достаточно для цели':`Доступно к цели ${fmtMoney(Math.min(f.target,f.available))} · осталось ${fmtMoney(f.remaining)}`):'Задай сумму, которую нужно собрать для этой цели.');
  setText('goalGlobalBalance',`Касса: ${fmtMoney(f.cash)} · Общий капитал: ${fmtMoney(f.available)}`);
  setText('goalPotentialText',f.target?`Доступно к цели: ${fmtMoney(Math.min(f.target,f.available))} / ${fmtMoney(f.target)}`:'Потенциал цели появится после задания суммы.');
  setText('goalPotentialSub',f.target?`В цели ${fmtMoney(f.saved)} + свободная касса ${fmtMoney(f.cash)}. Деньги в руках автоматически учитываются в направлении к цели.`:'Сумма цели ещё не задана.');
  const bank=Math.max(0,Number(state.debts?.bank)||0),allDebt=debtTotal();setText('goalBankDebt',fmtMoney(bank));setText('goalBankMeta',`Платёж / месяц: ${fmtMoney(state.debts.monthlyPayment||0)}`);setText('goalAllDebt',fmtMoney(allDebt));
  if(f.target){const d=f.days?`${f.completed?`Полный капитал собран за ${f.days} дн.`:`Идёт ${f.days}-й день накопления.`}`:'Первое пополнение запустит отсчёт дней.';setText('goalFinanceDays',d);renderGoalDistance();}else setText('goalFinanceDays','После задания суммы здесь появится срок накопления.');
  const contrib=[...(state.goal.finance.contributions||[])].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,10);
  $('goalSavingList').innerHTML=contrib.length?contrib.map(e=>`<div class="saving-item"><div class="saving-main"><div class="saving-title">Пополнение цели</div><div class="saving-meta">${esc(e.note||'Без комментария')} · ${esc(fmtDateTime(new Date(e.at)))}</div></div><div class="saving-amount">+${esc(fmtMoney(e.amount))}</div><button class="delete-x" data-del-saving="${esc(e.id)}" aria-label="Удалить накопление">×</button></div>`).join(''):'<div class="empty">Пополнений пока нет. Можно вести сумму вручную или добавлять накопления кнопкой выше.</div>';
  $$('[data-del-saving]').forEach(b=>b.onclick=()=>{const id=b.dataset.delSaving;state.goal.finance.contributions=state.goal.finance.contributions.filter(x=>x.id!==id);syncGoalFinanceCompletion();saveState();renderAll();toast('Пополнение удалено')});
  renderGoalChart();renderGoalAI();
  $('milestones').innerHTML=state.goal.milestones.map((m,i)=>`<div class="milestone ${m.done?'done':''}"><div class="m-no">${m.done?'✓':i+1}</div><div><div class="m-title">${esc(m.title)}</div><div class="m-status">${m.done?'Этап закрыт':'Впереди'}</div></div><input class="check" type="checkbox" data-ms="${esc(m.id)}" ${m.done?'checked':''}></div>`).join('');
  $$('[data-ms]').forEach(c=>c.onchange=()=>{const m=state.goal.milestones.find(x=>x.id===c.dataset.ms);if(!m)return;m.done=c.checked;const next=state.goal.milestones.find(x=>!x.done);state.goal.next=next?next.title:'Цель достигнута — выбери следующий финансовый ориентир.';saveState();renderAll();toast(c.checked?'Этап закрыт':'Этап открыт',m.title)});
  $('achievements').innerHTML=state.achievements.length?state.achievements.slice().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).map(a=>`<div class="note"><div class="note-title">Результат</div><div class="note-body">${esc(a.text)}</div><div class="note-time">${esc(fmtDateTime(new Date(a.at)))}</div></div>`).join(''):'<div class="empty">Здесь остаются реальные завершённые результаты.</div>';
}

function renderDebtChart(){ensureDebtHistory();const arr=state.debtHistory.slice(-8),chart=$('debtChart');if(!chart)return;if(!arr.length){chart.innerHTML='';return}const vals=arr.map(x=>Number(x.total)||0),max=Math.max(...vals,1);chart.innerHTML=arr.map(x=>{const h=Math.max(4,(Number(x.total||0)/max)*100),d=new Date(x.day+'T12:00:00');return `<div class="debt-bar-wrap"><i class="debt-bar" style="height:${h}%" title="${esc(fmtMoney(x.total))}"></i><span class="debt-bar-label">${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}</span></div>`}).join('');const month=monthKey(),monthArr=state.debtHistory.filter(x=>String(x.day).startsWith(month));const first=(monthArr[0]||arr[0])?.total,last=(monthArr[monthArr.length-1]||arr[arr.length-1])?.total,delta=(Number(first)||0)-(Number(last)||0);setText('debtChartNote',delta>0?`За текущий месяц долг уменьшился на ${fmtMoney(delta)}.`:delta<0?`За текущий месяц долг вырос на ${fmtMoney(Math.abs(delta))}.`:'За текущий месяц зафиксированных изменений долга нет.')}
function normalizeProfitSource(v){
  const raw=String(v||'').trim();
  const s=raw.toLowerCase();
  if(s.includes('зарп')||s.includes('работ'))return 'Зарплата';
  if(s.includes('фриланс')||s.includes('подработ')||s.includes('услуг'))return 'Фриланс';
  if(s.includes('тотализ')||s.includes('ставк')||s.includes('бет')||s.includes('спорт')||s.includes('аналитик'))return 'Спортивная аналитика';
  return PROFIT_SOURCES.includes(raw)?raw:'Фриланс';
}
function totalProfitAll(){return FinanceEngine.totalIncome()}
function totalExpenseAll(){return FinanceEngine.totalExpense()}
function walletMetrics(){return FinanceEngine.wallet()}
function previousBestDayNet(){
  const days=new Set([...state.profits,...state.expenses].map(x=>x.dateKey||keyDay(new Date(x.at))));
  days.delete(keyDay());
  let best=0;
  for(const day of days){const p=daySum(state.profits,day),e=daySum(state.expenses,day);best=Math.max(best,p-e)}
  return best;
}
function monthKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function budgetSpent(name){const month=monthKey();return (state.expenses||[]).reduce((sum,e)=>{const at=new Date(e.at);if(Number.isNaN(at.getTime())||dateKeyFromDate(at).slice(0,7)!==month)return sum;return sum+(String(e.category||'').trim().toLowerCase()===String(name||'').trim().toLowerCase()?Math.max(0,Number(e.amount)||0):0)},0)}
function renderBudgets(){const list=$('budgetList');if(!list)return;const rows=Array.isArray(state.budgets)?state.budgets:[];if(!rows.length){list.innerHTML='<div class="empty">Добавь бюджет, например: Еда 1000 · Дом 1500 · Транспорт 500.</div>';return}list.innerHTML=rows.map(b=>{const spent=budgetSpent(b.name),planned=Math.max(0,Number(b.planned)||0),remaining=planned-spent,pct=planned?clamp(Math.round(spent/planned*100),0,100):(spent?100:0);return `<div class="budget-row ${remaining<0?'over':''}"><div><div class="budget-name"><span class="budget-ico">${esc(EXPENSE_ICONS[b.name]||'🧾')}</span>${esc(b.name)}</div><div class="budget-meta">План: ${esc(fmtMoney(planned))} · Потрачено: ${esc(fmtMoney(spent))}</div></div><div><div class="budget-track"><i class="budget-fill" style="width:${pct}%"></i></div><div class="budget-state">${remaining>=0?`Осталось ${esc(fmtMoney(remaining))}`:`Перерасход ${esc(fmtMoney(Math.abs(remaining)))}`}</div></div><button class="delete-x" data-del-budget="${esc(b.id)}" aria-label="Удалить бюджет">×</button></div>`}).join('');$$('[data-del-budget]').forEach(b=>b.onclick=()=>{state.budgets=state.budgets.filter(x=>x.id!==b.dataset.delBudget);saveState();renderMoney();toast('Бюджет удалён')})}
function openBudget(){const d=state.drafts?.budget||{};openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-card"></use></svg></span>Бюджет месяца</div><h2>Добавить бюджет</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="field"><label>На что</label><input id="budgetName" placeholder="Например: Еда" value="${esc(d.name||'')}"></div><div class="field"><label>Плановая сумма / месяц</label><input id="budgetPlanned" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${esc(d.planned||'')}"></div><div class="sub">После сохранения расходы с такой же категорией будут автоматически уменьшать этот бюджет.</div><div style="display:flex;justify-content:flex-end"><button class="btn primary" id="saveBudgetBtn"><svg class="ui-icon"><use href="#i-arrow-up"></use></svg> Добавить</button></div></div>`);$('closeModalBtn').onclick=closeModal;const auto=()=>saveDraft('budget',{name:$('budgetName').value,planned:$('budgetPlanned').value});['budgetName','budgetPlanned'].forEach(id=>$(id).addEventListener('input',auto));$('saveBudgetBtn').onclick=()=>{const name=$('budgetName').value.trim()||'';const planned=Math.max(0,Number($('budgetPlanned').value)||0);if(!name||planned<=0){toast('Укажи название и сумму');return}const old=state.budgets.find(b=>b.name.toLowerCase()===name.toLowerCase());if(old){old.planned=planned}else state.budgets.unshift({id:uid(),name,planned});clearDraft('budget');saveState();closeModal();renderMoney();toast(old?'Бюджет обновлён':'Бюджет добавлен')};setTimeout(()=>$('budgetName').focus(),50)}
function renderFinanceAnalysis(){
  const el=$('financeAnalysis');if(!el)return;
  const monthProfit=monthSum(state.profits),monthExpense=monthSum(state.expenses),net=monthProfit-monthExpense,wm=walletMetrics(),goal=goalFinanceMetrics(),debt=debtTotal();
  const cat=new Map();for(const e of state.expenses||[]){const d=new Date(e.at);if(Number.isNaN(d.getTime())||dateKeyFromDate(d).slice(0,7)!==monthKey())continue;const k=(e.category||'Без категории').trim()||'Без категории';cat.set(k,(cat.get(k)||0)+Math.max(0,Number(e.amount)||0))}
  const topCat=[...cat.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
  const src=new Map(PROFIT_SOURCES.map(s=>[s,0]));for(const p of state.profits||[]){const k=normalizeProfitSource(p.sourceGroup||p.source);src.set(k,(src.get(k)||0)+Math.max(0,Number(p.amount)||0))}
  const topSrc=[...src.entries()].sort((a,b)=>b[1]-a[1])[0];
  const direction=net>0?'После расходов капитал растёт.':net<0?'Расходы сейчас опережают доходы.':'Движение денег сбалансировано.';
  const goalDirection=goal.target?`До цели осталось ${esc(fmtMoney(goal.remaining))}; доступно к ней ${esc(fmtMoney(Math.min(goal.target,goal.available)))}.`:'Сумма цели ещё не задана.';
  el.innerHTML=`<div class="finance-analysis-grid"><div class="finance-analysis-item"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-wallet"></use></svg></span>Капитал в руках</div><div class="value">${esc(fmtMoney(wm.cash))}</div></div><div class="finance-analysis-item"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-target"></use></svg></span>К цели доступно</div><div class="value">${esc(fmtMoney(Math.min(goal.target||Infinity,goal.available)))}</div></div><div class="finance-analysis-item"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-card"></use></svg></span>Банк</div><div class="value">${esc(fmtMoney(state.debts.bank))}</div></div></div><div class="analysis-item"><b><svg class="ui-icon"><use href="#i-arrow-right"></use></svg>Направление денег</b><div>${esc(direction)} В этом месяце пришло ${esc(fmtMoney(monthProfit))}, ушло ${esc(fmtMoney(monthExpense))}, чистый результат ${esc(fmtMoney(net))}.</div></div><div class="analysis-item"><b><svg class="ui-icon"><use href="#i-arrow-down"></use></svg>Куда уходят средства</b><div>${topCat.length?esc(topCat.map(([k,v])=>`${k} — ${fmtMoney(v)}`).join(' · ')):'Расходов пока нет.'}</div></div><div class="analysis-item"><b><svg class="ui-icon"><use href="#i-arrow-up"></use></svg>Откуда приходят средства</b><div>${topSrc&&topSrc[1]>0?`Главный источник по объёму: ${esc(topSrc[0])} — ${esc(fmtMoney(topSrc[1]))}.`:'Поступлений пока нет.'}</div></div><div class="analysis-item"><b><svg class="ui-icon"><use href="#i-target"></use></svg>Курс к цели</b><div>${goalDirection}</div></div><div class="analysis-item"><b><svg class="ui-icon"><use href="#i-card"></use></svg>Банк и обязательства</b><div>Банк: ${esc(fmtMoney(state.debts.bank))} · Все долги: ${esc(fmtMoney(debt))} · Обязательный платёж: ${esc(fmtMoney(state.debts.monthlyPayment||0))}.</div></div></div>`;
}

function renderMoneyBestDay(){
  const selectedKey=moneyViewDate||keyDay(),selectedNet=daySum(state.profits,selectedKey)-daySum(state.expenses,selectedKey);
  const days=new Set([...state.profits,...state.expenses].map(x=>x.dateKey||keyDay(new Date(x.at))));
  days.delete(selectedKey);
  let best=0;for(const day of days){const n=daySum(state.profits,day)-daySum(state.expenses,day);best=Math.max(best,n)}
  best=Math.max(best,0);
  const pct=best>0?clamp(Math.round((Math.max(selectedNet,0)/best)*100),0,100):(selectedNet>0?100:0);
  const bar=$('moneyBestDayBar');if(bar)bar.style.width=pct+'%';setText('moneyBestDayPct',`${pct}%`);
  const d=validDate(selectedKey)||new Date(),label=d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  if(selectedNet>best&&selectedNet>0){setText('moneyBestDayTitle','Лучший результат дня');setText('moneyBestDayText',`${label}: чистый результат ${fmtMoney(selectedNet)} — новый максимум.`)}
  else if(selectedNet>0){setText('moneyBestDayTitle','День движется вперёд');setText('moneyBestDayText',`${label}: чистый результат ${fmtMoney(selectedNet)}. Прибыль поднимает шкалу, расход её уменьшает.`)}
  else {setText('moneyBestDayTitle','Результат дня');setText('moneyBestDayText',`${label}: чистый результат 0. Добавь прибыль или зафиксируй расход — показатели пересчитаются сразу.`)}
}
function renderMoney(){
  const selectedKey=moneyViewDate||keyDay(),selectedDate=validDate(selectedKey)||new Date(),pt=daySum(state.profits,selectedKey),et=daySum(state.expenses,selectedKey),debt=debtTotal(),monthProfit=monthSum(state.profits),monthExpense=monthSum(state.expenses),monthNet=monthProfit-monthExpense,wm=walletMetrics();
  setText('mProfitToday',fmtMoney(pt));setText('mExpenseToday',fmtMoney(et));setText('mBalanceToday',fmtMoney(pt-et));setText('mGoalSaved',fmtMoney(wm.goal));setText('mMonth',fmtMoney(monthNet));setText('mDebt',fmtMoney(debt));setText('mPayment',`Платёж / мес: ${fmtMoney(state.debts.monthlyPayment||0)}`);setText('moneyFlowBalance',fmtMoney(wm.cash));setText('moneyGoalCapital',fmtMoney(wm.goal));setText('moneyTotalCapital',fmtMoney(wm.capital));setText('moneyDebtCapital',fmtMoney(debt));setText('moneySyncState',`Валюта: ${state.profile.currency||'сомони'}. Зарплата, фриланс и спортивная аналитика увеличивают общий капитал; личные и обычные расходы его уменьшают; на цель деньги можно распределять из той же общей кассы.`);
  const debtBase=Math.max(0,Number(state.debtBaseline)||debt);const debtPaid=Math.max(0,debtBase-debt);const incomePlan=Math.max(0,Number(state.income)||0);const payShare=incomePlan?Math.round((Number(state.debts.monthlyPayment||0)/incomePlan)*100):0;
  $('debtSummary').innerHTML=`<div class="kpi-row"><div class="kpi"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-card"></use></svg></span>Банк</div><div class="value">${esc(fmtMoney(state.debts.bank))}</div><div class="debt-kpi-note">отдельно</div></div><div class="kpi"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-briefcase"></use></svg></span>Фирмы</div><div class="value">${esc(fmtMoney(state.debts.firms))}</div><div class="debt-kpi-note">отдельно</div></div><div class="kpi"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-money"></use></svg></span>Всего</div><div class="value">${esc(fmtMoney(debt))}</div><div class="debt-kpi-note">всех обязательств</div></div><div class="kpi"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-calendar"></use></svg></span>Платёж / месяц</div><div class="value">${esc(fmtMoney(state.debts.monthlyPayment||0))}</div><div class="debt-kpi-note">${payShare?`≈ ${payShare}% от плана дохода`:''}</div></div><div class="kpi"><div class="label"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-check"></use></svg></span>Зафиксировано погашено</div><div class="value blue">${esc(fmtMoney(debtPaid))}</div><div class="debt-kpi-note">от стартовой суммы</div></div></div>`;
  setText('moneySelectedDateLabel',selectedDate.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}));$('moneyDateJump')?.setAttribute('value',selectedKey);$('moneyPrevDay')?.addEventListener('click',()=>{const d=new Date(selectedKey+'T12:00:00');d.setDate(d.getDate()-1);moneyViewDate=keyDay(d);renderMoney()});$('moneyNextDay')?.addEventListener('click',()=>{const d=new Date(selectedKey+'T12:00:00');d.setDate(d.getDate()+1);moneyViewDate=keyDay(d);renderMoney()});$('moneyDateJump')?.addEventListener('change',e=>{moneyViewDate=e.target.value||keyDay();renderMoney()});renderBudgets();renderMoneyBestDay();renderMoneyCharts();renderFinanceAnalysis();
  const profits=[...state.profits].filter(e=>e.dateKey===selectedKey||keyDay(validDate(e.at))===selectedKey).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,50),expenses=[...state.expenses].filter(e=>e.dateKey===selectedKey||keyDay(validDate(e.at))===selectedKey).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  $('profitList').innerHTML=profits.length?profits.map(e=>`<div class="money-item"><div class="money-main"><div class="money-title"><span class="money-ico">${esc(PROFIT_ICONS[normalizeProfitSource(e.sourceGroup||e.source)]||'💠')}</span>＋ ${esc(normalizeProfitSource(e.sourceGroup||e.source))}</div><div class="money-meta">${esc(e.note||'Без комментария')} · ${esc(fmtDateTime(new Date(e.at)))}</div></div><div class="money-amt blue">+${esc(fmtMoney(e.amount))}</div><button class="mini-action" data-edit-profit="${esc(e.id)}">Изменить</button><button class="delete-x" data-del-profit="${esc(e.id)}" aria-label="Удалить прибыль">×</button></div>`).join(''):'<div class="empty">Прибыли пока нет.</div>';
  $('expenseList').innerHTML=expenses.slice(0,20).length?expenses.slice(0,20).map(e=>`<div class="money-item"><div class="money-main"><div class="money-title"><span aria-hidden="true">${esc(e.categoryIcon||EXPENSE_ICONS[e.category]||'•')}</span>${esc(e.category||'Расход')}</div><div class="money-meta">${esc(e.note||'Без комментария')} · ${esc(fmtDateTime(new Date(e.at)))}${e.debtPayment?` · Платёж: ${e.debtPayment==='bank'?'Банк':'Фирмы'}`:''}</div></div><div class="money-amt red-txt">−${esc(fmtMoney(e.amount))}</div><button class="mini-action" data-edit-expense="${esc(e.id)}">Изменить</button><button class="delete-x" data-del-expense="${esc(e.id)}" aria-label="Удалить расход">×</button></div>`).join(''):'<div class="empty">Расходов пока нет.</div>';
  $('[data-edit-profit]').forEach(b=>b.onclick=()=>openMoneyEdit('profit',b.dataset.editProfit));$('[data-edit-expense]').forEach(b=>b.onclick=()=>openMoneyEdit('expense',b.dataset.editExpense));
  $('[data-del-profit]').forEach(b=>b.onclick=()=>{state.profits=state.profits.filter(x=>x.id!==b.dataset.delProfit);saveState();renderAll();toast('Прибыль удалена')});
  $$('[data-del-expense]').forEach(b=>b.onclick=()=>{const item=state.expenses.find(x=>x.id===b.dataset.delExpense);if(item?.debtPayment&&state.debts?.[item.debtPayment]!==undefined)state.debts[item.debtPayment]=Math.max(0,Number(state.debts[item.debtPayment]||0)+Math.max(0,Number(item.amount)||0));state.expenses=state.expenses.filter(x=>x.id!==b.dataset.delExpense);saveState();renderAll();toast('Расход удалён',item?.debtPayment?'Платёж по долгу возвращён в расчёт долга.':'Касса, цель и бюджеты пересчитаны.')});
}

function renderNotes(){
  purgeExpiredTrash(state);
  const q=(($('noteSearch')&&$('noteSearch').value)||'').trim().toLowerCase();
  let notes=[...(state.notes||[])].sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||(Date.parse(b.at||0)-Date.parse(a.at||0)));
  if(q)notes=notes.filter(n=>((n.title||'')+' '+(n.body||'')).toLowerCase().includes(q));
  const trash=$('trashCount'); if(trash)trash.textContent=String((state.notesTrash||[]).length);
  const list=$('notesList'); if(!list)return;
  list.innerHTML=notes.length?notes.map(n=>{
    const updated=n.updatedAt?`<div class="note-time">Изменено: ${esc(fmtDateTime(new Date(n.updatedAt)))}</div>`:'';
    return `<article class="note"><div class="note-head"><div><div class="note-title">${esc(n.title||'Без заголовка')}</div><div class="note-time">Создано: ${esc(fmtDateTime(new Date(n.at)))}</div>${updated}</div><div class="note-actions"><button class="mini-action ${n.pinned?'pin':''}" data-pin="${esc(n.id)}">${n.pinned?'<svg class="ui-icon"><use href="#i-check"></use></svg> Закреплено':'<svg class="ui-icon"><use href="#i-target"></use></svg> Закрепить'}</button><button class="mini-action" data-edit-note="${esc(n.id)}"><svg class="ui-icon"><use href="#i-pencil"></use></svg> Изменить</button><button class="mini-action" data-trash-note="${esc(n.id)}"><svg class="ui-icon"><use href="#i-trash"></use></svg> В корзину</button></div></div><div class="note-body">${esc(n.body||'')}</div></article>`;
  }).join(''):'<div class="empty">Заметок пока нет.</div>';
  $$('[data-pin]').forEach(b=>b.onclick=()=>{const n=state.notes.find(x=>x.id===b.dataset.pin);if(!n)return;n.pinned=!n.pinned;saveState();renderNotes()});
  $$('[data-edit-note]').forEach(b=>b.onclick=()=>openNote(b.dataset.editNote));
  $$('[data-trash-note]').forEach(b=>b.onclick=()=>moveToTrash(b.dataset.trashNote));
}
function renderTrashHTML(){
  purgeExpiredTrash(state);
  const arr=[...(state.notesTrash||[])].sort((a,b)=>Date.parse(b.deletedAt||0)-Date.parse(a.deletedAt||0));
  if(!arr.length)return '<div class="empty">Корзина пуста.</div>';
  return arr.map(n=>{
    const deleted=Date.parse(n.deletedAt||0)||Date.now();
    const expires=Math.max(0,Math.ceil((TRASH_TTL-(Date.now()-deleted))/DAY_MS));
    return `<article class="note"><div class="note-head"><div><div class="note-title">${esc(n.title||'Без заголовка')}</div><div class="note-time">Создано: ${esc(fmtDateTime(new Date(n.at)))}</div><div class="note-time">В корзине: ${esc(fmtDateTime(new Date(deleted)))}</div><div class="note-time">Удалится автоматически через ${expires} дн.</div></div><div class="note-actions"><button class="mini-action" data-restore-note="${esc(n.id)}"><svg class="ui-icon"><use href="#i-arrow-up"></use></svg> Восстановить</button><button class="mini-action" data-purge-note="${esc(n.id)}" style="color:var(--red)"><svg class="ui-icon"><use href="#i-trash"></use></svg> Удалить навсегда</button></div></div><div class="note-body">${esc(n.body||'')}</div></article>`;
  }).join('');
}
function moveToTrash(id){
  const i=(state.notes||[]).findIndex(n=>n.id===id);
  if(i<0)return;
  const n=state.notes.splice(i,1)[0];
  n.deletedAt=new Date().toISOString();
  state.notesTrash=state.notesTrash||[];
  state.notesTrash.unshift(n);
  saveState();
  renderNotes();
  toast('Заметка в корзине','После 30 дней она будет удалена автоматически.');
}
function restoreNote(id){
  const i=(state.notesTrash||[]).findIndex(n=>n.id===id);
  if(i<0)return;
  const n=state.notesTrash.splice(i,1)[0];
  delete n.deletedAt;
  state.notes=state.notes||[];
  state.notes.push(n);
  saveState();
  closeModal();
  renderNotes();
  toast('Заметка восстановлена');
}
async function compactRecoverySnapshots(){
  // Destructive cleanup: old recovery copies must not resurrect data the user removed.
  try{
    const current=localStorage.getItem(KEY);
    if(current)localStorage.setItem(BACKUP_KEY,current);
    localStorage.removeItem(BACKUP2_KEY);
    for(const k of LEGACY){try{localStorage.removeItem(k)}catch(e){}}
  }catch(e){}
  try{
    const db=await openLifeDB();
    if(!db)return;
    await new Promise(resolve=>{try{const tx=db.transaction('backups','readwrite');tx.objectStore('backups').clear();tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve}catch(e){resolve()}});
  }catch(e){}
}

function purgeNote(id){
  const before=(state.notesTrash||[]).length;
  state.notesTrash=(state.notesTrash||[]).filter(n=>n.id!==id);
  if(state.notesTrash.length===before)return;
  saveState();
  forgetDeletedNoteFromSnapshots(id).catch(()=>{});
  renderNotes();
  openTrash();
  toast('Удалено навсегда');
}
function openTrash(){openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-trash"></use></svg></span>30 дней</div><h2>Корзина заметок</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="trash-banner">Записи в корзине хранятся 30 дней. «Удалить навсегда» удаляет запись сразу. Автоочистка выполняется при запуске и периодически.</div><div class="stack" id="trashContent" style="margin-top:12px">${renderTrashHTML()}</div>`);$('closeModalBtn').onclick=closeModal;$$('[data-restore-note]').forEach(b=>b.onclick=()=>restoreNote(b.dataset.restoreNote));$$('[data-purge-note]').forEach(b=>b.onclick=()=>purgeNote(b.dataset.purgeNote))}
function saveDraft(kind,data){state.drafts=state.drafts||clone(DEFAULT.drafts);state.drafts[kind]={...(data||{}),updatedAt:new Date().toISOString()};queueAutosave()}
function clearDraft(kind){if(!state.drafts)return;state.drafts[kind]=null;saveState()}
function openNote(id=''){
  const draft=!id?(state.drafts?.note||null):null;const n=id?state.notes.find(x=>x.id===id):null;
  const title0=draft?.title??n?.title??'',body0=draft?.body??n?.body??'',pin0=draft?.pinned??n?.pinned??false;
  openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-note"></use></svg></span>Память</div><h2>${n?'Изменить заметку':'Новая заметка'}</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="field"><label>Заголовок</label><input id="noteTitleInput" maxlength="120" value="${esc(title0)}" placeholder="Название"></div><div class="field"><label>Текст</label><textarea id="noteBodyInput" maxlength="12000" placeholder="Пиши как есть...">${esc(body0)}</textarea></div><div class="sub">${n?`Создано: ${fmtDateTime(new Date(n.at))}`:'Автосохранение включено — запись не потеряется.'}</div><div class="row"><label class="small"><input type="checkbox" id="notePinned" ${pin0?'checked':''}> Закрепить</label><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn" id="cancelNoteBtn"><svg class="ui-icon"><use href="#i-arrow-right"></use></svg> Отмена</button><button class="btn primary" id="saveNoteBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Сохранить</button></div></div></div>`);
  $('closeModalBtn').onclick=closeModal;
  const sync=()=>{const title=$('noteTitleInput').value.trim(),body=$('noteBodyInput').value.trim(),pinned=$('notePinned').checked;if(n){n.title=title||'Без заголовка';n.body=body;n.pinned=pinned;n.updatedAt=new Date().toISOString();saveState();return}saveDraft('note',{title,body,pinned,at:state.drafts?.note?.at||new Date().toISOString()})};
  $('noteTitleInput').addEventListener('input',sync);$('noteBodyInput').addEventListener('input',sync);$('notePinned').addEventListener('change',sync);
  $('cancelNoteBtn').onclick=()=>{if(!n)clearDraft('note');closeModal()};
  $('saveNoteBtn').onclick=()=>{const title=$('noteTitleInput').value.trim()||'Без заголовка',body=$('noteBodyInput').value.trim(),pinned=$('notePinned').checked;if(!body){toast('Заметка пустая','Добавь текст.');$('noteBodyInput').focus();return}if(n){n.title=title;n.body=body;n.pinned=pinned;n.updatedAt=new Date().toISOString()}else{const at=state.drafts?.note?.at||new Date().toISOString();state.notes.unshift({id:uid(),title,body,pinned,at})}clearDraft('note');saveState();closeModal();renderNotes();toast(n?'Заметка изменена':'Заметка сохранена')};
  setTimeout(()=>$('noteBodyInput').focus(),50)
}
const EXPENSE_QUICK=[
  {value:'Личное',icon:'👤',label:'Личное'},
  {value:'Ресторан',icon:'🍽️',label:'Ресторан'},
  {value:'Лекарства',icon:'💊',label:'Лекарства'},
  {value:'Компьютерные игры',icon:'🎮',label:'Игры'},
  {value:'Одежда',icon:'👕',label:'Одежда'},
  {value:'Транспорт',icon:'🚕',label:'Транспорт'},
  {value:'Еда',icon:'🛒',label:'Еда'},
  {value:'Дом',icon:'🏠',label:'Дом'},
  {value:'Семья',icon:'👨‍👩‍👦',label:'Семья'},
  {value:'Другое',icon:'🧾',label:'Другое'}
];
const EXPENSE_ICONS=Object.fromEntries(EXPENSE_QUICK.map(x=>[x.value,x.icon]));
function moneyDateIso(dateKey,baseIso=''){const key=String(dateKey||keyDay()),t=baseIso?new Date(baseIso):new Date();const hh=String(t.getHours()).padStart(2,'0'),mm=String(t.getMinutes()).padStart(2,'0'),ss=String(t.getSeconds()).padStart(2,'0');return new Date(key+'T'+hh+':'+mm+':'+ss).toISOString()}
function openMoneyEdit(kind,id){const item=(kind==='profit'?state.profits:state.expenses).find(x=>x.id===id);if(item)openMoneyForm(kind,'',item)}
function openMoneyForm(kind,presetCategory='',editItem=null){
  const isProfit=kind==='profit',dk=isProfit?'moneyProfit':'moneyExpense',draft=editItem?{amount:editItem.amount,type:isProfit?(editItem.sourceGroup||editItem.source):editItem.category,note:editItem.note||'',customCategory:editItem.customCategory||'',debtPay:!!editItem.debtPayment,debtType:editItem.debtPayment||'bank',dateKey:keyDay(validDate(editItem.at))}:state.drafts?.[dk]||{};const editing=!!editItem;
  const sourceValue=normalizeProfitSource(draft.type||draft.source||'Зарплата');
  const savedCategory=draft.type||presetCategory||'Еда';
  const category=EXPENSE_QUICK.some(x=>x.value===savedCategory)?savedCategory:'Другое';
  const customDraft=String(draft.customCategory||((category==='Другое'&&savedCategory!=='Другое')?savedCategory:''));
  const typeField=isProfit
    ? `<select id="moneyType">${PROFIT_SOURCES.map(s=>`<option value="${esc(s)}" ${s===sourceValue?'selected':''}>${esc(PROFIT_ICONS[s]||'💠')} ${esc(s)}</option>`).join('')}</select>`
    : `<select id="moneyType">${EXPENSE_QUICK.map(x=>`<option value="${esc(x.value)}" ${x.value===category?'selected':''}>${esc(x.icon)} ${esc(x.label)}</option>`).join('')}</select><div class="expense-quick-grid">${EXPENSE_QUICK.map(x=>`<button type="button" class="expense-quick ${x.value===category?'active':''}" data-expense-quick="${esc(x.value)}"><span class="ico">${x.icon}</span><span>${esc(x.label)}</span></button>`).join('')}</div><div class="field" id="customExpenseWrap" style="display:${category==='Другое'?'block':'none'}"><label>Название расхода</label><input id="moneyCustomCategory" maxlength="80" placeholder="Например: кино, подарок, кофе" value="${esc(customDraft)}"></div><div class="expense-personal-hint">Выбирай готовую категорию. Для любого другого расхода нажми «Другое» и задай точное название — оно попадёт в историю и диаграмму расходов.</div>`;
  openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-money"></use></svg></span>Деньги</div><h2>${editing?(isProfit?'Изменить прибыль':'Изменить расход'):(isProfit?'Добавить прибыль':'Добавить расход')}</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="field"><label>Дата операции</label><input id="moneyDate" type="date" value="${esc(draft.dateKey||moneyViewDate||keyDay())}"></div><div class="field"><label>Сумма</label><input id="moneyAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0" value="${esc(draft.amount||'')}"></div><div class="field"><label>${isProfit?'Источник дохода':'Категория расхода'}</label>${typeField}</div>${!isProfit?`<label class="debt-payment-toggle"><input type="checkbox" id="moneyDebtPay"> Это платёж по долгу</label><div class="field" id="moneyDebtWrap" style="display:none"><label>Какой долг уменьшить</label><select id="moneyDebtType"><option value="bank">Банк</option><option value="firms">Фирмы</option></select></div>`:''}<div class="field"><label>Комментарий</label><input id="moneyNote" placeholder="Необязательно" value="${esc(draft.note||'')}"></div><div class="sub">${isProfit?'Доступны три источника: зарплата, фриланс и спортивная аналитика.':'Расход сразу уменьшает общую кассу и автоматически попадает в анализ.'} Поля сохраняются автоматически.</div><div style="display:flex;justify-content:flex-end"><button class="btn ${isProfit?'primary':'orange'}" id="saveMoneyBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> ${isProfit?'Сохранить прибыль':'Сохранить расход'}</button></div></div>`);
  $('closeModalBtn').onclick=closeModal;
  const syncCustomVisibility=()=>{if($('customExpenseWrap'))$('customExpenseWrap').style.display=$('moneyType').value==='Другое'?'block':'none'};
  const autosave=()=>editing?null:saveDraft(dk,{amount:$('moneyAmount').value,type:$('moneyType').value,note:$('moneyNote').value,customCategory:$('moneyCustomCategory')?.value||'',debtPay:$('moneyDebtPay')?.checked||false,debtType:$('moneyDebtType')?.value||'bank',dateKey:$('moneyDate').value});
  ['moneyDate','moneyAmount','moneyType','moneyNote','moneyCustomCategory','moneyDebtPay','moneyDebtType'].forEach(id=>$(id)?.addEventListener(id==='moneyDebtPay'||id==='moneyDebtType'||id==='moneyType'?'change':'input',()=>{if(id==='moneyDebtPay')$('moneyDebtWrap').style.display=$('moneyDebtPay').checked?'block':'none';syncCustomVisibility();autosave()}));
  if(!isProfit){$$('[data-expense-quick]').forEach(btn=>btn.onclick=()=>{const v=btn.dataset.expenseQuick;$('moneyType').value=v;$$('[data-expense-quick]').forEach(x=>x.classList.toggle('active',x===btn));syncCustomVisibility();autosave();if(v==='Другое')setTimeout(()=>$('moneyCustomCategory')?.focus(),30)})}
  if($('moneyDebtPay')){$('moneyDebtPay').checked=!!draft.debtPay;$('moneyDebtWrap').style.display=draft.debtPay?'block':'none';if($('moneyDebtType'))$('moneyDebtType').value=draft.debtType||'bank'}
  syncCustomVisibility();
  $('saveMoneyBtn').onclick=()=>{const amount=Number($('moneyAmount').value),dateKey=$('moneyDate').value||moneyViewDate||keyDay();if(!(amount>0)){toast('Укажи сумму');return}const at=moneyDateIso(dateKey,editItem?editItem.at:''),common={amount,at,dateKey,note:$('moneyNote').value.trim()};if(editing){const old=Number(editItem.amount)||0;if(!isProfit&&editItem.debtPayment)state.debts[editItem.debtPayment]=Math.max(0,Number(state.debts[editItem.debtPayment]||0)+old);Object.assign(editItem,common);if(isProfit){const g=normalizeProfitSource($('moneyType').value);editItem.source=g;editItem.sourceGroup=g}else{const selected=$('moneyType').value.trim(),custom=String($('moneyCustomCategory')?.value||'').trim(),cat=selected==='Другое'?(custom||'Другое'):selected,debtPay=!!$('moneyDebtPay')?.checked,debtType=$('moneyDebtType')?.value||'bank';Object.assign(editItem,{category:cat,personal:['Личное','Ресторан','Лекарства','Компьютерные игры','Одежда','Транспорт','Еда','Семья'].includes(cat),categoryIcon:EXPENSE_ICONS[cat]||(selected==='Другое'?'🧾':'•'),customCategory:selected==='Другое'?custom:'',debtPayment:debtPay?debtType:''});if(debtPay)state.debts[debtType]=Math.max(0,Number(state.debts[debtType]||0)-amount)}moneyViewDate=dateKey;saveState();closeModal();renderAll();toast('Операция изменена','Все показатели и графики пересчитаны.');return}if(isProfit){const g=normalizeProfitSource($('moneyType').value);state.profits.push({...common,id:uid(),source:g,sourceGroup:g})}else{const selected=$('moneyType').value.trim(),custom=String($('moneyCustomCategory')?.value||'').trim(),cat=selected==='Другое'?(custom||'Другое'):selected,debtPay=!!$('moneyDebtPay')?.checked,debtType=$('moneyDebtType')?.value||'bank';state.expenses.push({...common,id:uid(),category:cat,personal:['Личное','Ресторан','Лекарства','Компьютерные игры','Одежда','Транспорт','Еда','Семья'].includes(cat),categoryIcon:EXPENSE_ICONS[cat]||(selected==='Другое'?'🧾':'•'),customCategory:selected==='Другое'?custom:'',debtPayment:debtPay?debtType:''});if(debtPay)state.debts[debtType]=Math.max(0,Number(state.debts[debtType]||0)-amount)}moneyViewDate=dateKey;saveState();closeModal();renderAll();toast(isProfit?'Прибыль добавлена':'Расход добавлен','Цель, капитал, графики и шкалы обновлены.')};setTimeout(()=>$('moneyAmount').focus(),50)
}
function openGoalSaving(){
  syncGoalFinanceCompletion();const f=state.goal.finance||{},draft=state.drafts?.goalSaving||{};
  if(!(Number(f.targetAmount)>0)){toast('Сначала задай сумму цели');openGoalFinanceEdit();return}
  openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-target"></use></svg></span>Цель</div><h2>Внести накопление</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="field"><label>Сумма пополнения</label><input id="gsAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0" value="${esc(draft.amount||'')}"></div><div class="field"><label>Комментарий</label><input id="gsNote" placeholder="Например: отложил с зарплаты" value="${esc(draft.note||'')}"></div><div class="sub">Поля сохраняются автоматически. Сейчас собрано: ${esc(fmtMoney(f.savedAmount))} · осталось: ${esc(fmtMoney(Math.max(0,Number(f.targetAmount||0)-Number(f.savedAmount||0))))}</div><div style="display:flex;justify-content:flex-end"><button class="btn primary" id="saveGoalSavingBtn"><svg class="ui-icon"><use href="#i-arrow-up"></use></svg> Внести</button></div></div>`);
  $('closeModalBtn').onclick=closeModal;const autosave=()=>saveDraft('goalSaving',{amount:$('gsAmount').value,note:$('gsNote').value});['gsAmount','gsNote'].forEach(id=>$(id).addEventListener('input',autosave));
  $('saveGoalSavingBtn').onclick=()=>{const amount=Number($('gsAmount').value);if(!(amount>0)){toast('Укажи сумму');$('gsAmount').focus();return}syncGoalFinanceCompletion();const remaining=Math.max(0,Number(state.goal.finance.targetAmount||0)-Number(state.goal.finance.savedAmount||0));if(!(remaining>0)){toast('Капитал уже собран полностью');clearDraft('goalSaving');closeModal();return}const cashBefore=walletMetrics().cash;if(!(cashBefore>0)){toast('В кассе нет доступной суммы','Сначала добавь прибыль или уменьши расход.');return}const applied=Math.min(amount,remaining,cashBefore);if(!(applied>0)){toast('Недостаточно доступных денег','Сумма накопления не может превышать текущую кассу.');return}if(!state.goal.finance.startedAt)state.goal.finance.startedAt=new Date().toISOString();state.goal.finance.contributions=Array.isArray(state.goal.finance.contributions)?state.goal.finance.contributions:[];state.goal.finance.contributions.unshift({id:uid(),amount:applied,note:$('gsNote').value.trim(),at:new Date().toISOString()});syncGoalFinanceCompletion();clearDraft('goalSaving');saveState();closeModal();renderAll();toast('Накопление добавлено',`${fmtMoney(applied)} внесено в капитал цели. Все разделы обновлены.`)};setTimeout(()=>$('gsAmount').focus(),50)
}

function openGoalFinanceEdit(){
  syncGoalFinanceCompletion();const f=state.goal.finance||{targetAmount:0,savedAmount:0,manualSavedAmount:0,targetDate:'',startedAt:'',completedAt:'',contributions:[]},d=state.drafts?.goalFinance||{},started=f.startedAt?new Date(f.startedAt):null,startValue=started&&!Number.isNaN(started.getTime())?started.toISOString().slice(0,10):'';
  openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-target"></use></svg></span>Финансовая цель</div><h2>Настройка капитала</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="grid g2"><div class="field"><label>Нужная сумма</label><input id="gfTarget" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(d.target??f.targetAmount)}"></div><div class="field"><label>Уже собрано всего</label><input id="gfSaved" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(d.saved??f.savedAmount)}"></div></div><div class="grid g2"><div class="field"><label>Начало накопления</label><input id="gfStart" type="date" value="${esc(d.start??startValue)}"></div><div class="field"><label>Плановая дата</label><input id="gfDate" type="date" value="${esc((d.date??f.targetDate)||'')}"></div></div><div class="sub">Поля сохраняются автоматически. Добавленные пополнения сохраняются отдельно.</div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn primary" id="saveGoalFinanceBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Сохранить</button></div></div>`);$('closeModalBtn').onclick=closeModal;
  const autosave=()=>saveDraft('goalFinance',{target:$('gfTarget').value,saved:$('gfSaved').value,start:$('gfStart').value,date:$('gfDate').value});['gfTarget','gfSaved','gfStart','gfDate'].forEach(id=>{$(id).addEventListener('input',autosave);$(id).addEventListener('change',autosave)});
  $('saveGoalFinanceBtn').onclick=()=>{const target=Math.max(0,Number($('gfTarget').value)||0),savedTotal=Math.max(0,Number($('gfSaved').value)||0),startDate=$('gfStart').value||'',targetDate=$('gfDate').value||'',contributions=Array.isArray(f.contributions)?f.contributions:[],contributionTotal=goalContributionTotal({contributions}),baseline=Math.max(0,savedTotal-contributionTotal);let startedAt=f.startedAt||'';if(startDate){const dt=new Date(startDate+'T00:00:00');startedAt=Number.isNaN(dt.getTime())?'':dt.toISOString()}else if(!startedAt&&(target>0||savedTotal>0))startedAt=new Date().toISOString();state.goal.finance={targetAmount:target,savedAmount:baseline+contributionTotal,manualSavedAmount:baseline,targetDate,startedAt,completedAt:f.completedAt||'',contributions};syncGoalFinanceCompletion();clearDraft('goalFinance');saveState();closeModal();renderGoal();toast('Капитал цели обновлён')};
}
function openGoalEdit(){
  const d=state.drafts?.goalEdit||{},g=state.goal;openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-settings"></use></svg></span>Настройка</div><h2>Главная цель</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="field"><label>Цель</label><textarea id="gTitle">${esc(d.title??g.title)}</textarea></div><div class="field"><label>Зачем</label><textarea id="gWhy">${esc(d.why??g.why)}</textarea></div><div class="field"><label>Следующий шаг</label><input id="gNext" value="${esc(d.next??g.next)}"></div><div class="field"><label>Этапы цели</label><textarea id="gMilestones">${esc(d.milestones??g.milestones.map(m=>`${m.done?'[x] ':'[ ] '}${m.title}`).join('\n'))}</textarea></div><div class="sub">Изменения полей сохраняются автоматически. Кнопка «Сохранить» завершает настройку.</div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn" id="goalFinanceFromEdit"><svg class="ui-icon"><use href="#i-money"></use></svg> Финансовая сумма</button><button class="btn primary" id="saveGoalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Сохранить</button></div></div>`);$('closeModalBtn').onclick=()=>{clearDraft('goalEdit');closeModal()};
  const autosave=()=>{const lines=$('gMilestones').value.split(/\n+/).map(x=>x.trim()).filter(Boolean),old=g.milestones;state.goal.title=$('gTitle').value.trim()||g.title;state.goal.why=$('gWhy').value.trim();const firstOpen=lines.map(x=>x.replace(/^\[[ xX]\]\s*/,'').trim()).find((_,idx)=>!/\[x\]/i.test(lines[idx]||''));state.goal.next=$('gNext').value.trim()||firstOpen||state.goal.next;state.goal.milestones=lines.length?lines.map(line=>{const done=/^\[x\]\s*/i.test(line),title=line.replace(/^\[[ xX]\]\s*/,'').trim(),prev=old.find(m=>m.title===title);return {id:prev?.id||uid(),title,done}}):clone(DEFAULT.goal.milestones);state.drafts.goalEdit={title:$('gTitle').value,why:$('gWhy').value,next:$('gNext').value,milestones:$('gMilestones').value};saveState();renderGoal();renderToday()};['gTitle','gWhy','gNext','gMilestones'].forEach(id=>$(id).addEventListener('input',autosave));
  $('goalFinanceFromEdit').onclick=()=>{saveDraft('goalEdit',{title:$('gTitle').value,why:$('gWhy').value,next:$('gNext').value,milestones:$('gMilestones').value});closeModal();setTimeout(openGoalFinanceEdit,0)};$('saveGoalBtn').onclick=()=>{autosave();clearDraft('goalEdit');closeModal();renderAll();toast('Цель обновлена');setTimeout(()=>requestGoalAI(true),80)}
}
function openAchievement(){
  const d=state.drafts?.achievement||{};openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-spark"></use></svg></span>Результат</div><h2>Зафиксировать</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="field"><label>Что конкретно достиг</label><textarea id="achInput" placeholder="Например: закрыл этап, накопил сумму, закончил часть работы...">${esc(d.text||'')}</textarea></div><div class="sub">Текст сохраняется автоматически.</div><div style="display:flex;justify-content:flex-end"><button class="btn primary" id="saveAchBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Сохранить результат</button></div></div>`);$('closeModalBtn').onclick=closeModal;$('achInput').addEventListener('input',()=>saveDraft('achievement',{text:$('achInput').value}));$('saveAchBtn').onclick=()=>{const t=$('achInput').value.trim();if(!t){toast('Добавь факт');return}state.achievements.push({id:uid(),text:t,at:new Date().toISOString()});clearDraft('achievement');saveState();closeModal();renderGoal();toast('Результат сохранён')};setTimeout(()=>$('achInput').focus(),50)
}
function openDebtEdit(){
  const d=state.drafts?.debt||{};openModal(`<div class="close-row"><div><div class="eyebrow"><svg class="ui-icon"><use href="#i-card"></use></svg> Обязательства</div><h2>Долги</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="grid g2"><div class="field"><label>Банк</label><input id="db" type="number" min="0" value="${esc(d.bank??state.debts.bank)}"></div><div class="field"><label>Фирмы</label><input id="df" type="number" min="0" value="${esc(d.firms??state.debts.firms)}"></div></div><div class="field"><label>Обязательный платёж / месяц</label><input id="dp" type="number" min="0" value="${esc(d.payment??state.debts.monthlyPayment)}"></div><div class="sub">Изменения долгов сохраняются автоматически.</div><div style="display:flex;justify-content:flex-end"><button class="btn primary" id="saveDebtBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Сохранить</button></div></div>`);$('closeModalBtn').onclick=closeModal;const autosave=()=>{state.debts.bank=Math.max(0,Number($('db').value)||0);state.debts.firms=Math.max(0,Number($('df').value)||0);state.debts.monthlyPayment=Math.max(0,Number($('dp').value)||0);saveDraft('debt',{bank:$('db').value,firms:$('df').value,payment:$('dp').value});renderMoney();renderTodayLight()};['db','df','dp'].forEach(id=>$(id).addEventListener('input',autosave));$('saveDebtBtn').onclick=()=>{autosave();clearDraft('debt');closeModal();renderMoney();toast('Долги обновлены')}
}
function openNotifications(){state.lastReadAt=new Date().toISOString();saveState();updateBell();const logs=state.notificationsLog.slice(0,40);openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-bell"></use></svg></span>Офлайн</div><h2>Уведомления</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="grid g2" style="margin-top:12px"><button class="btn" id="reqN"><svg class="ui-icon"><use href="#i-bell"></use></svg> Разрешить системные</button><button class="btn" id="syncN"><svg class="ui-icon"><use href="#i-clock"></use></svg> Обновить расписание</button></div><div class="sub" style="margin-top:8px">История уведомлений хранится локально. В Android-версии расписание можно закрепить системным будильником.</div><div class="notice-list">${logs.length?logs.map(n=>`<div class="notice"><div class="notice-dot"></div><div><div class="notice-title">${esc(n.title)}</div><div class="notice-body">${esc(n.body)}</div><div class="notice-time">${esc(fmtDateTime(new Date(n.at)))}</div></div></div>`).join(''):'<div class="empty">Уведомлений пока нет.</div>'}</div>`);$('closeModalBtn').onclick=closeModal;$('reqN').onclick=requestNotifications;$('syncN').onclick=()=>{scheduleNative();toast('Расписание обновлено')}}

function aiSourceConsent(){
  const a=state.ai?.consent||{};
  return {goal:a.goal!==false,money:a.money!==false,reports:a.reports!==false,notes:a.notes===true};
}
function normalizeAIError(data,status){
  const raw=String(data?.error||data?.message||'').trim();
  if(status===401||status===403)return 'Нужен вход в Life Control. Войди в аккаунт и повтори запрос.';
  if(status===429)return raw||'AI временно ограничен бесплатным лимитом. Попробуй позже.';
  if(status===503)return raw||'Gemini API-ключ ещё не настроен в Supabase Secrets.';
  return raw||('AI HTTP '+status);
}
async function getAISessionToken(){
  let a=cloudAuth();
  if(!a?.access_token){await cloudRefresh();a=cloudAuth()}
  if(!a?.access_token)throw new Error('Сначала войди в Supabase-аккаунт Life Control.');
  return a.access_token;
}
async function callAI(options={}){
  if(state.ai?.enabled===false)throw new Error('AI-анализ отключён в настройках.');
  if('onLine' in navigator&&navigator.onLine===false)throw new Error('Нет интернет-соединения. Life Control Core продолжает работать офлайн.');
  const token=await getAISessionToken();
  const headers={'Content-Type':'application/json','apikey':SUPABASE_CONFIG.publishableKey,'Authorization':'Bearer '+token,'X-Life-Control':'1'};
  const body=options.ping?{ping:true}:{mode:options.mode||'life',scope:{goal:options.scope?.goal!==false,money:options.scope?.money!==false,reports:options.scope?.reports!==false,notes:options.scope?.notes===true,webSearch:options.scope?.webSearch===true}};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
  let res;
  try{res=await fetch(AI_FUNCTION_URL,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,cache:'no-store'})}
  catch(e){if(e?.name==='AbortError')throw new Error('Gemini не ответил за 50 секунд. Проверь интернет.');throw new Error('Не удалось связаться с Supabase AI. Проверь интернет-соединение.')}
  finally{clearTimeout(timer)}
  const raw=await res.text();let data={};try{data=JSON.parse(raw||'{}')}catch(e){}
  if(!res.ok){
    if((res.status===401||res.status===403)&&cloudAuth()?.refresh_token){
      await cloudRefresh();const rt=cloudAuth()?.access_token;
      if(rt){const retry=await fetch(AI_FUNCTION_URL,{method:'POST',headers:{...headers,Authorization:'Bearer '+rt},body:JSON.stringify(body),cache:'no-store'});const rr=await retry.text();let rd={};try{rd=JSON.parse(rr||'{}')}catch(e){};if(retry.ok)return rd;throw new Error(normalizeAIError(rd,retry.status))}
    }
    throw new Error(normalizeAIError(data,res.status));
  }
  return data;
}
function sourcesHtml(sources){
  if(!Array.isArray(sources)||!sources.length)return '';
  return '<div class="notice-time" style="margin-top:9px">Источники: '+sources.slice(0,8).map(x=>'<a href="'+esc(x.url||'#')+'" target="_blank" rel="noopener noreferrer">'+esc(x.title||x.url||'источник')+'</a>').join(' · ')+'</div>';
}
function openGeminiAnalysis(){
  const consent=aiSourceConsent();
  openModal('<div class="close-row"><div><div class="eyebrow">Life Control AI</div><h2>Анализ моей жизни</h2><div class="sub">AI получает только выбранные данные из твоего аккаунта. Запрос запускается только вручную.</div></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="card" style="margin-top:12px;padding:13px;background:var(--soft)"><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-report"></use></svg></span>Что использовать</div><div class="stack" style="margin-top:8px"><label class="small"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-target"></use></svg></span><input id="aiGoal" type="checkbox" '+(consent.goal?'checked':'')+'> Цель и её прогресс</label><label class="small"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-money"></use></svg></span><input id="aiMoney" type="checkbox" '+(consent.money?'checked':'')+'> Деньги, доходы, расходы и долги</label><label class="small"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-report"></use></svg></span><input id="aiReports" type="checkbox" '+(consent.reports?'checked':'')+'> Итоги и этапы дня</label><label class="small"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-note"></use></svg></span><input id="aiNotes" type="checkbox" '+(consent.notes?'checked':'')+'> Заметки (последние 15)</label><label class="small"><span class="kpi-icon"><svg class="ui-icon"><use href="#i-arrow-right"></use></svg></span><input id="aiWeb" type="checkbox" '+(state.ai?.webSearch?'checked':'')+'> Проверять актуальные внешние факты через Google</label></div><div class="sub" style="margin-top:8px">Основные данные сервер читает из твоей строки life_state в Supabase. Полный JSON состояния из браузера не отправляется.</div></div><div style="margin-top:10px"><button class="btn primary" id="aiRunBtn" style="width:100%"><svg class="ui-icon"><use href="#i-spark"></use></svg> Запустить AI-анализ</button></div><div class="ai-result" id="aiResult" style="margin-top:12px"></div>');
  $('closeModalBtn').onclick=closeModal;
  $('aiWeb').onchange=()=>{state.ai.webSearch=$('aiWeb').checked;saveState()};
 $('aiRunBtn').onclick=async()=>{const c={goal:$('aiGoal').checked,money:$('aiMoney').checked,reports:$('aiReports').checked,notes:$('aiNotes').checked,webSearch:$('aiWeb').checked};state.ai.consent=c;state.ai.webSearch=c.webSearch;saveState();const box=$('aiResult');$('aiRunBtn').disabled=true;box.innerHTML='<div class="empty">Gemini анализирует выбранные данные…</div>';try{const data=await callAI({scope:c}),entry={id:uid(),at:new Date().toISOString(),scope:c,result:String(data.output_text||''),sources:Array.isArray(data.sources)?data.sources:[]};state.ai.lastAnalysisAt=entry.at;state.ai.history.unshift(entry);state.ai.history=state.ai.history.slice(0,60);saveState();if(cloudAuth())cloudPush().catch(()=>{});box.innerHTML='<div class="analysis-item"><b>Результат Gemini</b><div style="white-space:pre-wrap;line-height:1.55">'+esc(entry.result)+'</div>'+sourcesHtml(entry.sources)+'<div class="notice-time" style="margin-top:8px">'+esc(fmtDateTime(new Date(entry.at)))+'</div></div>';toast('AI-анализ сохранён')}catch(e){box.innerHTML='<div class="analysis-item"><b>AI сейчас недоступен</b><div>'+esc(e.message||e)+'</div><div style="margin-top:8px"><button class="btn small" id="localFallbackBtn"><svg class="ui-icon"><use href="#i-report"></use></svg> Открыть локальный анализ</button></div></div>';$('localFallbackBtn')?.addEventListener('click',()=>{closeModal();openLifeAnalysis()})}finally{$('aiRunBtn').disabled=false}};
}
function validateDaySteps(){
  const steps=state.day.steps;
  if(!Array.isArray(steps)||steps.length!==3)return 'Должно быть ровно 3 этапа.';
  for(let i=0;i<steps.length;i++){
    const st=timeToMin(steps[i].time),en=timeToMin(steps[i].end);
    if(!(Number.isFinite(st)&&Number.isFinite(en)&&en>st))return `Проверь время этапа ${i+1}. Окончание должно быть позже начала.`;
    if(i>0 && st<timeToMin(steps[i-1].end))return `Этап ${i+1} начинается раньше окончания этапа ${i}. Исправь расписание.`;
  }
  return '';
}
function saveDaySchedule(){
  const draft=state.day.steps.map((st,i)=>({
    ...st,
    title:$('dsTitle'+i).value.trim()||`Этап ${i+1}`,
    time:$('dsTime'+i).value||DEFAULT.day.steps[i].time,
    end:$('dsEnd'+i).value||DEFAULT.day.steps[i].end,
    text:$('dsText'+i).value.trim(),
    details:$('dsDetails'+i).value.split(/\n+/).map(x=>x.trim()).filter(Boolean)
  }));
  const old=state.day.steps; state.day.steps=draft;
  const err=validateDaySteps();
  if(err){state.day.steps=old;toast('Расписание не сохранено',err);return false;}
  saveState();scheduleNative();renderAll();toast('Расписание сохранено','Этапы будут переключаться автоматически.');return true;
}
let aiHealthAt=0,aiHealthPromise=null;
function updateAISettingsState(){const el=$('aiSettingsState');if(!el)return;el.textContent=state.ai?.enabled?'AI проверяется автоматически…':'AI выключен'}
async function refreshAIHealth(force=false){
  const el=$('aiSettingsState');if(!el)return;
  if(!state.ai?.enabled){el.textContent='AI выключен';return}
  if(!force&&Date.now()-aiHealthAt<120000)return;
  if(aiHealthPromise)return aiHealthPromise;
  if('onLine' in navigator&&navigator.onLine===false){el.textContent='AI: нет сети';return}
  el.textContent='AI: проверка…';
  aiHealthPromise=(async()=>{
    try{
      const data=await callAI({ping:true});
      aiHealthAt=Date.now();
      el.textContent='AI в сети · '+(data?.model||AI_MODEL);
    }catch(e){
      aiHealthAt=Date.now();
      const msg=String(e?.message||e||'');
      el.textContent=/quota|rate.?limit|limit|429/i.test(msg)?'AI: лимит API':'AI: временно недоступен';
    }finally{aiHealthPromise=null}
  })();
  return aiHealthPromise;
}
function runSelfTest(){
  const checks=[];
  checks.push(['Хранилище',('localStorage' in window)&&('indexedDB' in window)]);
  checks.push(['Часы',!!$('clock')]);
  checks.push(['Цель',!!$('goalTitle')]);
  checks.push(['Деньги',!!$('profitList')&&!!$('expenseList')]);
  checks.push(['Заметки',!!$('notesList')]);
  checks.push(['Уведомления',('Notification' in window)||!!window.AndroidBridge]);
  checks.push(['Автосохранение',typeof saveState==='function'&&typeof restoreFromIndexedDB==='function']);
  checks.push(['Gemini / Supabase AI',typeof callAI==='function'&&typeof getAISessionToken==='function']);
  checks.push(['Три этапа',validateDaySteps()==='']);
  const navButtons=$('.bottom button[data-view]');
  const navViews=['viewToday','viewGoal','viewMoney','viewNotes'];
  checks.push(['Навигация',navButtons.length===4&&navViews.every(id=>!!$(id))]);
  checks.push(['Прокрутка',getComputedStyle(document.documentElement).overflowY!=='hidden'&&getComputedStyle(document.body).overflowY!=='hidden']);
  const errors=Array.isArray(state.runtimeErrors)?state.runtimeErrors.length:0;
  const ok=checks.every(x=>x[1])&&errors===0;
  const text=checks.map(([name,yes])=>`${yes?'✓':'✕'} ${name}`).join(' · ')+` · Ошибок сеанса: ${errors}`;
  const el=$('runtimeStatus');if(el)el.textContent=text;
  return ok;
}

function refreshCloudUI(){const a=cloudAuth(),st=$('cloudState'),u=$('cloudUserState'),net=$('cloudNetworkState'),sync=$('cloudSyncState');if(!st)return;if(a?.user?.email){st.textContent='Подключено';u.textContent=a.user.email;if(net)net.textContent=('onLine' in navigator&&navigator.onLine===false)?'Нет сети':'В сети';if(sync&&sync.textContent==='Проверяется…')sync.textContent='Автоматически'}else{st.textContent='Локально';u.textContent='Нет аккаунта';if(net)net.textContent=('onLine' in navigator&&navigator.onLine===false)?'Нет сети':'Локально';if(sync)sync.textContent='Не выполняется'}}
function openSettings(){
  const steps=state.day.steps;const stepDraft=Array.isArray(state.drafts?.settingsSteps)?state.drafts.settingsSteps:steps;
  const stepFields=steps.map((st,i)=>{const src=stepDraft[i]||st;return `<div class="card" style="padding:12px"><div class="row"><strong><svg class="ui-icon" style="width:14px;height:14px;vertical-align:-2px;color:var(--blue)"><use href="#i-arrow-right"></use></svg> Этап ${i+1}</strong><span class="small muted">в расписании</span></div><div class="grid g2" style="margin-top:9px"><div class="field"><label>Название</label><input id="dsTitle${i}" value="${esc(src.title)}"></div><div class="field"><label>Время начала / окончания</label><div class="grid g2"><input id="dsTime${i}" type="time" value="${esc(src.time)}"><input id="dsEnd${i}" type="time" value="${esc(src.end)}"></div></div></div><div class="field" style="margin-top:9px"><label>Описание</label><input id="dsText${i}" value="${esc(src.text)}"></div><div class="field" style="margin-top:9px"><label>Важные занятия, по одному в строке</label><textarea id="dsDetails${i}" placeholder="Например: проверить заявки\nпроверить размеры">${esc((src.details||[]).join('\n'))}</textarea></div></div>`}).join('');
  openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-settings"></use></svg></span>Система</div><h2>Настройки</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px"><div class="field"><label>Имя</label><input id="setName" value="${esc(state.profile.name)}"></div><div class="field"><label>Валюта</label><input id="setCurrency" value="${esc(state.profile.currency)}"></div><div class="field"><label>Плановая прибыль / месяц</label><input id="setIncome" type="number" min="0" value="${esc(state.income)}"></div><div class="field"><label>Начальный капитал / касса</label><input id="setOpeningBalance" type="number" min="0" step="0.01" value="${esc(state.wallet?.openingBalance||0)}"></div><div class="field"><label>Предупреждать до этапа, минут</label><input id="setPre" type="number" min="0" max="60" value="${esc(state.settings.preMinutes)}"></div><label class="small"><input id="setNotify" type="checkbox" ${state.settings.notifications?'checked':''}> Локальные уведомления</label><div class="grid g2"><button class="btn" id="reqN"><svg class="ui-icon"><use href="#i-bell"></use></svg> Разрешить уведомления</button><button class="btn" id="testN"><svg class="ui-icon"><use href="#i-check"></use></svg> Тест</button></div><div class="card" style="padding:12px;margin-bottom:10px"><div class="row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-cloud"></use></svg></span>Облако Life Control</div><strong id="cloudState">Подключено</strong><div class="sub">Аккаунт подключён автоматически. Синхронизация запускается при входе и продолжается автоматически.</div></div><span class="small muted" id="cloudUserState">${esc(cloudAuth()?.user?.email||'—')}</span></div><div class="grid g2" style="margin-top:9px"><div class="kpi"><div class="label">Сеть</div><div class="value blue" id="cloudNetworkState">Проверяется…</div></div><div class="kpi"><div class="label">Синхронизация</div><div class="value blue" id="cloudSyncState">Автоматически</div></div></div><div class="sub" style="margin-top:8px">Данные сохраняются локально и автоматически синхронизируются с Supabase, когда аккаунт и интернет доступны.</div><div class="grid g2" style="margin-top:9px"><button class="btn red" id="cloudLogoutBtn"><svg class="ui-icon"><use href="#i-x"></use></svg> Выйти</button><div class="small muted" style="display:flex;align-items:center;justify-content:center;text-align:center">Вход и восстановление пароля выполняются на экране авторизации.</div></div></div><div class="card" style="padding:12px"><div class="row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-spark"></use></svg></span>Интеллектуальный слой</div><strong>Life Control AI</strong><div class="sub">AI работает только по твоей команде и получает только выбранные данные.</div></div><span class="small muted" id="aiSettingsState">—</span></div><div class="card" style="margin-top:9px;padding:12px;background:var(--soft)"><div class="eyebrow">AI-сервис</div><strong>Gemini 3.6 Flash</strong><div class="sub" style="margin-top:3px">Проверка подключения выполняется автоматически. API-ключ хранится только в Supabase Secrets.</div><div class="notice-time" style="margin-top:6px">Supabase Edge Function · безопасный серверный доступ</div></div><label class="small" style="display:flex;align-items:center;gap:7px;margin-top:8px"><input id="setAiEnabled" type="checkbox" ${state.ai.enabled!==false?'checked':''}> AI-анализ включён</label><div class="sub" style="margin-top:7px">Статус AI обновляется автоматически при входе, подключении сети и открытии настроек. Отдельная кнопка проверки не нужна.</div></div></div><div class="section"><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-clock"></use></svg></span>Расписание</div><h2 style="margin-top:4px">Настроить 3 этапа</h2><div class="stack" style="margin-top:10px">${stepFields}</div><button class="btn primary" id="saveDayBtn" style="margin-top:10px"><svg class="ui-icon"><use href="#i-check"></use></svg> Сохранить расписание</button></div><div class="grid g2"><button class="btn" id="exportBtn"><svg class="ui-icon"><use href="#i-report"></use></svg> Экспорт JSON</button><label class="btn" style="display:grid;place-items:center">Импорт JSON<input id="importInput" type="file" accept="application/json" hidden></label></div><div class="card section"><div class="eyebrow"><svg class="ui-icon"><use href="#i-settings"></use></svg> Состояние системы</div><h2 style="margin-top:4px">Самопроверка</h2><div class="runtime-status" id="runtimeStatus">Проверяется автоматически.</div><div class="grid g2" style="margin-top:9px"><button class="btn" id="selfTestBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Проверить</button><button class="btn" id="clearErrorsBtn"><svg class="ui-icon"><use href="#i-trash"></use></svg> Очистить ошибки</button></div></div><button class="btn red" id="resetBtn"><svg class="ui-icon"><use href="#i-trash"></use></svg> Сбросить локальные данные</button></div>`);
  $('closeModalBtn').onclick=closeModal;$('reqN').onclick=requestNotifications;$('testN').onclick=()=>notify('Life Control','Тест: система уведомлений работает.');$('selfTestBtn').onclick=()=>runSelfTest();$('clearErrorsBtn').onclick=()=>{state.runtimeErrors=[];saveState();runSelfTest()};runSelfTest();$('exportBtn').onclick=exportJSON;$('importInput').onchange=importJSON;
  $('closeModalBtn').onclick=closeModal;refreshCloudUI();refreshAIHealth();$('cloudLogoutBtn').onclick=()=>{if(confirm('Выйти из Life Control? Данные в Supabase сохранятся.'))cloudLogout()};$('setName').addEventListener('input',()=>{state.profile.name=$('setName').value;saveState()});$('setCurrency').addEventListener('input',()=>{state.profile.currency=$('setCurrency').value||'сомони';saveState();renderAll()});$('setIncome').addEventListener('input',()=>{state.income=Math.max(0,Number($('setIncome').value)||0);saveState();renderAll()});$('setOpeningBalance').addEventListener('input',()=>{state.wallet.openingBalance=Math.max(0,Number($('setOpeningBalance').value)||0);saveState();renderAll()});$('setPre').addEventListener('input',()=>{state.settings.preMinutes=clamp(Number($('setPre').value)||0,0,60);saveState();scheduleNative()});$('setNotify').addEventListener('change',()=>{state.settings.notifications=$('setNotify').checked;saveState();scheduleNative()});
  $('setAiEnabled').addEventListener('change',()=>{state.ai.enabled=$('setAiEnabled').checked;saveState();updateAISettingsState();refreshAIHealth(true)});updateAISettingsState();refreshAIHealth();
  const readStepDraft=()=>steps.map((st,i)=>({id:st.id,title:$('dsTitle'+i).value,text:$('dsText'+i).value,time:$('dsTime'+i).value,end:$('dsEnd'+i).value,details:$('dsDetails'+i).value.split(/\n+/).map(x=>x.trim()).filter(Boolean)}));
  const autoSchedule=()=>{const d=readStepDraft();state.drafts.settingsSteps=d;const probe={...state,day:{...state.day,steps:d}};const prev=state;state=probe;const err=validateDaySteps();state=prev;if(err){saveState();return}state.day.steps=d;delete state.drafts.settingsSteps;saveState();scheduleNative();renderAll()};
  for(let i=0;i<steps.length;i++)['dsTitle','dsText','dsTime','dsEnd','dsDetails'].forEach(prefix=>$(prefix+i)?.addEventListener('input',autoSchedule));
  $('saveDayBtn').onclick=()=>{if(saveDaySchedule())closeModal()};
  $('resetBtn').onclick=()=>{if(confirm('Удалить все локальные данные Life Control?')){for(const k of [KEY,BACKUP_KEY,BACKUP2_KEY,...LEGACY]){try{localStorage.removeItem(k)}catch(e){}}try{indexedDB.deleteDatabase('LifeControlDB');indexedDB.deleteDatabase('LifeControlV26DB')}catch(e){}location.reload()}}
}
function exportJSON(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`life-control-backup-${keyDay()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Резервная копия сохранена')}
async function forgetDeletedNoteFromSnapshots(id){
  try{
    for(const k of [KEY,BACKUP_KEY,BACKUP2_KEY,...LEGACY]){
      const raw=safeReadStorage(k);if(!raw)continue;
      try{
        const s=JSON.parse(raw);
        if(Array.isArray(s.notes))s.notes=s.notes.filter(n=>n?.id!==id);
        if(Array.isArray(s.notesTrash))s.notesTrash=s.notesTrash.filter(n=>n?.id!==id);
        localStorage.setItem(k,JSON.stringify(s));
      }catch(e){}
    }
  }catch(e){}
  try{
    const db=await openLifeDB();if(!db)return;
    await new Promise(resolve=>{try{
      const tx=db.transaction(['state','backups'],'readwrite');
      const clean=rec=>{if(!rec?.payload)return;try{const s=JSON.parse(rec.payload);if(Array.isArray(s.notes))s.notes=s.notes.filter(n=>n?.id!==id);if(Array.isArray(s.notesTrash))s.notesTrash=s.notesTrash.filter(n=>n?.id!==id);rec.payload=JSON.stringify(s);return rec}catch(e){return rec}};
      const ss=tx.objectStore('state'),bs=tx.objectStore('backups');
      const sr=ss.get('current');sr.onsuccess=()=>{const rec=clean(sr.result);if(rec)ss.put(rec)};
      const br=bs.getAll();br.onsuccess=()=>{for(const rec of br.result||[]){const cleanRec=clean(rec);if(cleanRec)bs.put(cleanRec)}};
      tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;
    }catch(e){resolve()}});
  }catch(e){}
}
async function importJSON(ev){
  const file=ev?.target?.files?.[0];if(!file)return;
  try{
    const text=await file.text();const parsed=JSON.parse(text);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Файл не содержит корректное состояние Life Control.');
    if(!Array.isArray(parsed.profits)||!Array.isArray(parsed.expenses)||!Array.isArray(parsed.notes))throw new Error('Это не полный резервный файл Life Control.');
    if(!confirm('Импорт заменит локальные данные текущего устройства. Перед импортом текущая версия останется в резервной копии. Продолжить?'))return;
    const current=JSON.stringify(state);
    try{localStorage.setItem(BACKUP2_KEY,current);localStorage.setItem(BACKUP_KEY,current)}catch(e){}
    state=normalize(parsed);
    state._cloudBaseUpdatedAt='';
    _persistFingerprint='';
    saveState();
    renderAll();scheduleNative();refreshCloudUI();
    toast('Резервная копия импортирована','Проверь данные перед продолжением работы.');
  }catch(e){toast('Импорт не выполнен',e?.message||String(e))}
  finally{if(ev?.target)ev.target.value=''}
}
  state.version=56;saveState()
function openReportHistory(){
  const entries=Object.entries(state.reports||{}).filter(([,r])=>{if(!r)return false;const hasFields=['done','block','future','tomorrow'].some(k=>String(r[k]||'').trim());return hasFields||!!r.savedAt}).sort((a,b)=>b[0].localeCompare(a[0]));
  const html=entries.length?entries.slice(0,90).map(([day,r])=>{
    const d=new Date(day+'T12:00:00');
    return `<div class="card" style="padding:12px"><div class="row"><strong>${esc(d.toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'}))}</strong><span class="small muted">${r.savedAt?esc(fmtDateTime(new Date(r.savedAt))):'Автосохранено'}</span></div><div class="stack" style="margin-top:8px"><div class="sub">Факт: ${esc(r.done||'—')}</div><div class="sub">Помешало: ${esc(r.block||'—')}</div><div class="sub">К цели: ${esc(r.future||'—')}</div><div class="sub">Завтра: ${esc(r.tomorrow||'—')}</div></div></div>`;
  }).join(''):'<div class="empty">Сохранённых итогов пока нет.</div>';
  openModal(`<div class="close-row"><div><div class="eyebrow cell-head"><span class="section-title-icon"><svg class="ui-icon"><use href="#i-calendar"></use></svg></span>Память дней</div><h2>История итогов</h2></div><button class="btn small" id="closeModalBtn"><svg class="ui-icon"><use href="#i-check"></use></svg> Закрыть</button></div><div class="stack" style="margin-top:12px">${html}</div>`);
  $('closeModalBtn').onclick=closeModal;
}
function updateBell(){const unread=state.notificationsLog.some(n=>!state.lastReadAt||Date.parse(n.at)>Date.parse(state.lastReadAt));$('bellDot').classList.toggle('show',unread)}
function showView(id){
  const target=document.getElementById(id);
  if(!target)return;
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v===target));
  document.querySelectorAll('.bottom button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
}

/* V52 delegated navigation */
(function hardenNavigation(){
  const navigate=(button)=>{
    if(!button)return;
    const id=button.dataset.view;
    if(!id)return;
    try{showView(id);}catch(err){console.error('[Life Control] navigation error',err);}
  };
  document.addEventListener('click',(event)=>{
    const button=event.target instanceof Element ? event.target.closest('.bottom button[data-view]') : null;
    if(button){event.preventDefault();navigate(button);}
  },true);
  document.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const button=event.target instanceof Element ? event.target.closest('.bottom button[data-view]') : null;
    if(button){event.preventDefault();navigate(button);}
  },true);
  window.showView=window.showView||showView;
})();

/* V55.1 reliable wheel fallback and direct nav */
(function(){
  const nav=(el)=>{const b=el&&el.closest?el.closest('.bottom button[data-view]'):null;if(!b)return false;const id=b.dataset.view;if(!id)return false;try{showView(id);return true}catch(e){console.error('[Life Control] nav',e);return false;}};
  document.addEventListener('pointerup',e=>{if(nav(e.target))e.preventDefault();},true);
  document.addEventListener('click',e=>{if(nav(e.target)){e.preventDefault();e.stopPropagation();}},true);
  document.addEventListener('wheel',e=>{
    if(document.body.classList.contains('auth-locked'))return;
    if(document.querySelector('.modal-back.open'))return;
    const t=e.target instanceof Element?e.target:null;
    if(t&&t.closest('input,textarea,select,.modal'))return;
    if(Math.abs(e.deltaY)>0){window.scrollBy({top:e.deltaY,left:0,behavior:'auto'});e.preventDefault();}
  },{passive:false,capture:true});
})();
(function mobileScrollGuard(){
  let startY=0;
  document.addEventListener('touchstart',e=>{if(e.touches?.length===1)startY=e.touches[0].clientY},{passive:true,capture:true});
  document.addEventListener('touchmove',e=>{
    if(document.body.classList.contains('auth-locked'))return;
    if(document.querySelector('.modal-back.open'))return;
    const t=e.target instanceof Element?e.target:null;
    if(t?.closest('input,textarea,select,.modal,.bottom'))return;
    if(e.touches?.length===1){const dy=startY-e.touches[0].clientY;if(Math.abs(dy)>0)window.scrollBy(0,dy);startY=e.touches[0].clientY;}
  },{passive:false,capture:true});
})();
function openModal(html){$('modal').innerHTML=`<div class="grab"></div>${html}`;$('modalBack').classList.add('open')}
function closeModal(){clearInterval(dayProgressTimer);dayProgressTimer=null;$('modalBack').classList.remove('open')}
initLayoutMode();
function renderAll(){setTheme();purgeExpiredTrash(state);renderToday();renderGoal();renderMoney();renderNotes();updateBell()}
function openMetricDetail(type){const wm=walletMetrics(),debt=debtTotal(),goal=goalFinanceMetrics(),p=daySum(state.profits),e=daySum(state.expenses);let title='Показатель',body='';if(type==='cash'){title='Баланс денег';body='<div class="kpi-row"><div class="kpi"><div class="label">Сегодня пришло</div><div class="value blue">'+esc(fmtMoney(p))+'</div></div><div class="kpi"><div class="label">Сегодня ушло</div><div class="value red-txt">'+esc(fmtMoney(e))+'</div></div><div class="kpi"><div class="label">Свободно</div><div class="value orange-txt">'+esc(fmtMoney(wm.cash))+'</div></div></div>'}else if(type==='debt'){title='Долг';body='<div class="kpi-row"><div class="kpi"><div class="label">Банк</div><div class="value">'+esc(fmtMoney(state.debts.bank))+'</div></div><div class="kpi"><div class="label">Фирмы</div><div class="value">'+esc(fmtMoney(state.debts.firms))+'</div></div><div class="kpi"><div class="kpi"><div class="label">Всего</div><div class="value red-txt">'+esc(fmtMoney(debt))+'</div></div></div><div class="sub" style="margin-top:10px">Платёж / месяц: '+esc(fmtMoney(state.debts.monthlyPayment||0))+'</div>'}else if(type==='goal'){title='Цель';body='<div class="kpi-row"><div class="kpi"><div class="label">Доступно</div><div class="value blue">'+esc(fmtMoney(goal.available))+'</div></div><div class="kpi"><div class="label">Цель</div><div class="value">'+esc(fmtMoney(goal.target))+'</div></div><div class="kpi"><div class="label">Осталось</div><div class="value orange-txt">'+esc(fmtMoney(goal.remaining))+'</div></div></div>'}else{title='Дисциплина';body='<div class="kpi"><div class="label">Этапов выполнено сегодня</div><div class="value">'+Object.values(dayReport().steps||{}).filter(Boolean).length+' / '+state.day.steps.length+'</div></div>'}openModal('<div class="close-row"><div><div class="eyebrow">Life Control · подробности</div><h2>'+title+'</h2></div><button class="btn small" id="closeModalBtn">Закрыть</button></div><div style="margin-top:12px">'+body+'</div>');$('closeModalBtn').onclick=closeModal}
function bind(){
  if(appBound)return;appBound=true;
  $$('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  const homeBrand=$('homeBrand');homeBrand.onclick=()=>{closeModal();showView('viewToday')};homeBrand.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();homeBrand.click()}};
  $('themeBtn').onclick=toggleTheme;$('notifyBtn').onclick=openNotifications;$('settingsBtn').onclick=openSettings;[['dashCash','cash'],['dashDebt','debt'],['dashGoal','goal'],['dashDiscipline','discipline']].forEach(([id,type])=>{const el=$(id),card=el?.closest('.kpi');if(card){card.classList.add('clickable-kpi');card.tabIndex=0;card.onclick=()=>openMetricDetail(type);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openMetricDetail(type)}}}});$('calendarBtn').onclick=openCalendar;$('pulseDayCard').onclick=openDayProgress;
  const reportInputs=['rDone','rBlock','rFuture','rTomorrow'];
  reportInputs.forEach(id=>$(id).addEventListener('input',()=>{const r=dayReport();r.done=$('rDone').value;r.block=$('rBlock').value;r.future=$('rFuture').value;r.tomorrow=$('rTomorrow').value;r.savedAt=r.savedAt||new Date().toISOString();queueAutosave();$('reportSaved').textContent='Автосохранение…'}));
  $('saveReportBtn').onclick=()=>{const r=dayReport();r.done=$('rDone').value.trim();r.block=$('rBlock').value.trim();r.future=$('rFuture').value.trim();r.tomorrow=$('rTomorrow').value.trim();r.savedAt=new Date().toISOString();saveState();renderToday();toast('Итог дня сохранён','Завтра начинаем с одного шага.')};
  $('historyBtn').onclick=openReportHistory;$('lifeAnalysisBtn').onclick=openLifeAnalysis;$('aiAnalysisBtn').onclick=openGeminiAnalysis;
  $('dayMode').onchange=()=>{const d=dailyState();d.mode=$('dayMode').value;state.dayMode=d.mode;saveState();renderToday()};
  $('addNoteBtn').onclick=()=>openNote();$('trashBtn').onclick=openTrash;$('noteSearch').oninput=renderNotes;
  $('addProfitBtn').onclick=()=>openMoneyForm('profit');$('addExpenseBtn').onclick=()=>openMoneyForm('expense');$('addPersonalExpenseBtn').onclick=()=>openMoneyForm('expense','Личное');$('addBudgetBtn').onclick=openBudget;$('todayAddProfitBtn').onclick=()=>openMoneyForm('profit');$('todayAddExpenseBtn').onclick=()=>openMoneyForm('expense');$('editGoalBtn').onclick=openGoalEdit;$('goalAiBtn').onclick=()=>requestGoalAI(true);$('editGoalFinanceBtn').onclick=openGoalFinanceEdit;$('editGoalFinanceBtn2').onclick=openGoalFinanceEdit;$('addGoalSavingBtn').onclick=openGoalSaving;$('addAchBtn').onclick=openAchievement;$('editDebtBtn').onclick=openDebtEdit;$('editDebtBtn2').onclick=openDebtEdit;
  $('modalBack').onclick=e=>{if(e.target===$('modalBack'))closeModal()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && $('modalBack').classList.contains('open'))closeModal()});
}
window.addEventListener('error',ev=>{try{state.runtimeErrors=Array.isArray(state.runtimeErrors)?state.runtimeErrors:[];state.runtimeErrors.unshift({at:new Date().toISOString(),message:String(ev.error?.message||ev.message||'Неизвестная ошибка')});state.runtimeErrors=state.runtimeErrors.slice(0,20);queueAutosave();}catch(e){}});
window.addEventListener('unhandledrejection',ev=>{try{state.runtimeErrors=Array.isArray(state.runtimeErrors)?state.runtimeErrors:[];state.runtimeErrors.unshift({at:new Date().toISOString(),message:String(ev.reason?.message||ev.reason||'Необработанная ошибка')});state.runtimeErrors=state.runtimeErrors.slice(0,20);queueAutosave();}catch(e){}});
function authErrorFromUrl(){try{const q=new URLSearchParams(location.hash.slice(1));const code=q.get('error_code')||q.get('error');const desc=q.get('error_description');if(code||desc){clearAuthHash();setTimeout(()=>toast('Ошибка входа',decodeURIComponent(desc||code||'Ссылка недействительна')),250);return true}}catch(e){}return false}
function lockApp(){document.body.classList.add('auth-locked');const el=$('authLock');if(el)el.hidden=false}
function unlockApp(){document.body.classList.remove('auth-locked');const el=$('authLock');if(el)el.hidden=true}
function setAuthProgress(text,pct){setText('authProgressText',text);const bar=$('authProgressBar');if(bar)bar.style.width=clamp(Number(pct)||0,0,100)+'%'}
function setAuthBusy(id,busy,label){const b=$(id);if(!b)return;if(!b.dataset.defaultHtml)b.dataset.defaultHtml=b.innerHTML;b.disabled=!!busy;b.innerHTML=busy?'<span class="auth-spinner"></span><span>'+esc(label)+'</span>':b.dataset.defaultHtml}
async function requireAuth(){
  const recovery=recoverySessionFromUrl();
  if(recovery){unlockApp();return true}
  const stored=cloudAuth();
  if(stored?.access_token){
    unlockApp();
    Promise.resolve().then(async()=>{
      const user=await cloudUser();
      if(user){setCloudAuth({...cloudAuth(),user});return}
      const refreshed=await cloudRefresh();
      if(refreshed?.access_token){const refreshedUser=await cloudUser();if(refreshedUser)setCloudAuth({...refreshed,user:refreshedUser});}
    }).catch(()=>{});
    return true;
  }
  lockApp();
  const email=$('gateEmail'),pass=$('gatePassword'),msg=$('gateMsg');
  const say=t=>{if(msg)msg.textContent=t};
   $('gateLoginBtn').onclick=async()=>{setAuthBusy('gateLoginBtn',true,'Вход…');setAuthProgress('Проверяю аккаунт…',20);say('');try{const d=await cloudSignIn(email.value.trim(),pass.value);setAuthProgress('Сессия подтверждена…',45);if(!d?.access_token)throw new Error(d?.msg||d?.error_description||d?.message||'Неверный email или пароль.');const u=await cloudUser();setAuthProgress('Загружаю личные данные…',65);setCloudAuth({...d,user:u||d.user});unlockApp();bind();lastDay=keyDay();await cloudPullIntoLocal();setAuthProgress('Готово',100);renderAll();refreshCloudUI();toast('Вход выполнен','Life Control открыт.')}catch(e){say(String(e.message||e));setAuthProgress('Вход не выполнен',0)}finally{setAuthBusy('gateLoginBtn',false,'Войти')}};
   $('gateSignupBtn').onclick=async()=>{setAuthBusy('gateSignupBtn',true,'Создаю аккаунт…');setAuthProgress('Создаю защищённый профиль…',25);say('');try{const d=await cloudSignUp(email.value.trim(),pass.value);setAuthProgress('Профиль создан…',55);if(d?.session?.access_token){setCloudAuth(d.session);unlockApp();bind();lastDay=keyDay();await cloudPullIntoLocal();setAuthProgress('Готово',100);renderAll();refreshCloudUI();say('');toast('Аккаунт создан','Life Control открыт.')}else{say('Аккаунт создан. Проверь почту и подтверди адрес, затем войди.');setAuthProgress('Проверь почту',65)}}catch(e){say(String(e.message||e));setAuthProgress('Создание не завершено',0)}finally{setAuthBusy('gateSignupBtn',false,'Создать аккаунт')}};
   $('gateResetBtn').onclick=async()=>{setAuthBusy('gateResetBtn',true,'Отправляю…');setAuthProgress('Отправляю письмо восстановления…',35);try{const em=email.value.trim();if(!/^\\S+@\\S+\\.\\S+$/.test(em))throw new Error('Введи корректный email.');await cloudRecover(em);setAuthProgress('Письмо отправлено',100);say('Письмо восстановления отправлено.')}catch(e){say(String(e.message||e));setAuthProgress('Не удалось отправить',0)}finally{setAuthBusy('gateResetBtn',false,'Забыли пароль?')}};
  return false;
}
async function init(){
  const authError=authErrorFromUrl();
  const recovery=await requireAuth();
  if(!cloudAuth()&&!recovery)return;
  bind();lastDay=keyDay();restoreFromIndexedDB().finally(async()=>{initPersistence();renderAll();scheduleNative();runScheduler();appReadyForSync=true;queueAutosave();refreshCloudUI();if(cloudAuth()){cloudAutoSync().catch(()=>{});refreshAIHealth(true).catch(()=>{})}});
  setInterval(runScheduler,1000);
  setInterval(()=>{const removed=purgeExpiredTrash(state);if(removed)saveState()},60*60*1000);
  let syncHeartbeatTimer=null;
  const runCloudHeartbeat=()=>{if(appReadyForSync&&document.visibilityState==='visible'&&cloudAuth()&&navigator.onLine!==false)cloudAutoSync().catch(()=>{})};
  syncHeartbeatTimer=setInterval(runCloudHeartbeat,1000);
  runCloudHeartbeat();
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveState()}else{runScheduler();scheduleNative();restoreFromIndexedDB().finally(()=>{if(appReadyForSync&&cloudAuth()&&navigator.onLine!==false)cloudAutoSync().catch(()=>{})})}});
  window.addEventListener('pagehide',saveState);window.addEventListener('beforeunload',saveState);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
window.addEventListener('online',()=>{refreshCloudUI();if(appReadyForSync&&cloudAuth()){cloudAutoSync();refreshAIHealth(true)}});window.addEventListener('offline',()=>{refreshCloudUI();refreshAIHealth(true)});init();
