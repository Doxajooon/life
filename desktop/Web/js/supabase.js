/* Life Control V56 CLEAN — Supabase/auth integration */
const SUPABASE_CONFIG={url:'https://riqmwueobjazfnhvvumy.supabase.co',publishableKey:'sb_publishable_17lPUQIiyRmlEpFkqosvKg_SBoxJuy8'};
const AI_FUNCTION_URL='https://riqmwueobjazfnhvvumy.supabase.co/functions/v1/life-control-ai';
const AI_MODEL='gemini-3.6-flash';
let calendarRangeStart='',calendarRangeEnd='',goalAiBusy=false,dayProgressTimer=null,appBound=false;
const AUTH_REDIRECT_URL='https://doxajooon.github.io/life/';
const CLOUD_BASE_KEY='_cloudBaseUpdatedAt';
let _persistFingerprint='';
let _cloudConflictNoticeAt=0;
const DEFAULT_AUTH_EMAIL='';
const CLOUD_AUTH_KEY='LIFE_CONTROL_SUPABASE_AUTH_V1';
function cloudAuth(){try{return JSON.parse(localStorage.getItem(CLOUD_AUTH_KEY)||'null')}catch(e){return null}}
function setCloudAuth(v){try{if(v)localStorage.setItem(CLOUD_AUTH_KEY,JSON.stringify(v));else localStorage.removeItem(CLOUD_AUTH_KEY)}catch(e){}}
async function supaFetch(path,opts={}){
  const auth=cloudAuth(); const headers={'apikey':SUPABASE_CONFIG.publishableKey,'Content-Type':'application/json',...(opts.headers||{})};
  if(auth?.access_token) headers.Authorization='Bearer '+auth.access_token;
  const res=await fetch(SUPABASE_CONFIG.url+path,{...opts,headers});
  const raw=await res.text(); let data=null; try{data=raw?JSON.parse(raw):null}catch(e){data=raw}
  if(!res.ok){const msg=data?.msg||data?.message||data?.error_description||data?.error||raw||('HTTP '+res.status);throw new Error('Supabase '+res.status+': '+msg)}
  return data;
}
async function cloudSignIn(email,password){const data=await supaFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});setCloudAuth(data);return data}
async function cloudSignUp(email,password){const data=await supaFetch('/auth/v1/signup?redirect_to='+encodeURIComponent(AUTH_REDIRECT_URL),{method:'POST',body:JSON.stringify({email,password})});if(data?.session)setCloudAuth(data.session);return data}
async function cloudRecover(email){return await supaFetch('/auth/v1/recover?redirect_to='+encodeURIComponent(AUTH_REDIRECT_URL),{method:'POST',body:JSON.stringify({email})})}
async function cloudUpdatePassword(password){const a=cloudAuth();if(!a?.access_token)throw new Error('Ссылка восстановления недействительна или истекла. Запроси новое письмо.');return await supaFetch('/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer '+a.access_token},body:JSON.stringify({password})})}
function clearAuthHash(){try{history.replaceState({},document.title,location.pathname+location.search)}catch(e){location.hash=''}}
function recoverySessionFromUrl(){try{const q=new URLSearchParams(location.hash.slice(1));const at=q.get('access_token'),rt=q.get('refresh_token'),type=q.get('type');if(at&&rt&&(type==='recovery'||q.get('type')==='recovery')){setCloudAuth({access_token:at,refresh_token:rt,token_type:q.get('token_type')||'bearer',expires_in:Number(q.get('expires_in')||0),user:null});clearAuthHash();return true}}catch(e){}return false}
async function openPasswordRecovery(){
  openModal('<div class="close-row"><div><div class="eyebrow">Life Control</div><h2>Новый пароль</h2><div class="sub">Ссылка восстановления приняла сессию. Задай новый пароль для аккаунта.</div></div></div><div class="stack" style="margin-top:12px"><div class="field"><label>Новый пароль</label><input id="recoveryPassword1" type="password" autocomplete="new-password" placeholder="Минимум 6 символов"></div><div class="field"><label>Повтори пароль</label><input id="recoveryPassword2" type="password" autocomplete="new-password" placeholder="Повтори пароль"></div><button class="btn primary" id="recoverySaveBtn">Сохранить новый пароль</button></div>');
  $('recoverySaveBtn').onclick=async()=>{const a=$('recoveryPassword1').value,b=$('recoveryPassword2').value;if(a.length<6){toast('Пароль слишком короткий','Минимум 6 символов.');return}if(a!==b){toast('Пароли не совпадают');return}try{await cloudUpdatePassword(a);const u=await cloudUser();const auth=cloudAuth();if(auth) setCloudAuth({...auth,user:u||auth.user});closeModal();toast('Пароль изменён','Теперь можно войти в Life Control с новым паролем.')}catch(e){toast('Не удалось сменить пароль',e.message)}};
}
async function cloudRefresh(){const a=cloudAuth();if(!a?.refresh_token)return null;try{const data=await supaFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:a.refresh_token})});if(data?.access_token)setCloudAuth({...data,user:data?.user||a.user||null});return data||null}catch(e){return null}}
async function cloudLogout(){clearCloudDirty();const a=cloudAuth();try{if(a?.access_token)await supaFetch('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+a.access_token}})}catch(e){}setCloudAuth(null);try{localStorage.removeItem(CLOUD_BASE_KEY)}catch(e){}location.reload()}
async function cloudUser(){const a=cloudAuth();if(!a?.access_token)return null;try{return await supaFetch('/auth/v1/user',{headers:{Authorization:'Bearer '+a.access_token}})}catch(e){return null}}
async function cloudPull(){let user=await cloudUser();if(!user){await cloudRefresh();user=await cloudUser()}if(!user)return null;const rows=await supaFetch('/rest/v1/life_state?select=state,schema_version,updated_at&user_id=eq.'+encodeURIComponent(user.id)+'&limit=1');return {user, row:Array.isArray(rows)?rows[0]||null:null}}
async function cloudPush(){
  let user=await cloudUser();
  if(!user){await cloudRefresh();user=await cloudUser()}
  if(!user)throw new Error('Войдите в Supabase, чтобы синхронизировать данные.');
  const latest=await cloudPull();
  const remote=latest?.row;
  const remoteStamp=remote?.updated_at||remote?.state?._lastSavedAt||'';
  const baseStamp=state[CLOUD_BASE_KEY]||'';
  const localDirty=_localDirtySinceCloud || (()=>{try{return localStorage.getItem(CLOUD_DIRTY_KEY)==='1'}catch(e){return false}})();
  if(remote?.state && !localDirty && ((!baseStamp && remoteStamp && Date.parse(remoteStamp||'')>Date.parse(state._lastSavedAt||'')) || (baseStamp && remoteStamp && remoteStamp!==baseStamp))){
    state=normalize(remote.state);
    state[CLOUD_BASE_KEY]=remoteStamp;
    _persistFingerprint='';
    _cloudBaseFingerprint=stateFingerprint();
    clearCloudDirty();
    saveState();
    renderAll();scheduleNative();
    const now=Date.now();if(now-_cloudConflictNoticeAt>10000){_cloudConflictNoticeAt=now;toast('Данные обновлены в облаке','Эта вкладка не перезаписала более новую версию Supabase.');}
    return false;
  }
  state.version=55;const body={user_id:user.id,state,schema_version:55,device_id:getDeviceId()};
  const saved=await supaFetch('/rest/v1/life_state?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)});
  const row=Array.isArray(saved)?saved[0]:saved;
  state[CLOUD_BASE_KEY]=row?.updated_at||new Date().toISOString();
  _cloudBaseFingerprint=stateFingerprint();
  clearCloudDirty();
  return true;
}
function getDeviceId(){try{let x=localStorage.getItem('LIFE_CONTROL_DEVICE_ID');if(!x){x=uid();localStorage.setItem('LIFE_CONTROL_DEVICE_ID',x)}return x}catch(e){return uid()}}
async function cloudSync(){
  const localStamp=Date.parse(state._lastSavedAt||'')||0;
  const pulled=await cloudPull();
  if(!pulled)return {ok:false,logged:false};
  const row=pulled.row;
  if(!row?.state){state[CLOUD_BASE_KEY]='';await cloudPush();setCloudAuth({...cloudAuth(),user:pulled.user});return {ok:true,logged:true,user:pulled.user};}
  const cloudStamp=Date.parse(row.state?._lastSavedAt||row.updated_at||'')||0;
  const localDirty=_localDirtySinceCloud || (()=>{try{return localStorage.getItem(CLOUD_DIRTY_KEY)==='1'}catch(e){return false}})();
  if(localDirty){
    await cloudPush();
  }else if(cloudStamp>localStamp){
    state=normalize(row.state);
    state[CLOUD_BASE_KEY]=row.updated_at||row.state?._lastSavedAt||'';
    _persistFingerprint='';
    _cloudBaseFingerprint=stateFingerprint();
    clearCloudDirty();
    saveState();renderAll();scheduleNative();
  }else if(cloudStamp<localStamp){
    await cloudPush();
  }else{
    state[CLOUD_BASE_KEY]=row.updated_at||row.state?._lastSavedAt||'';
    _cloudBaseFingerprint=stateFingerprint();
    clearCloudDirty();
  }
  setCloudAuth({...cloudAuth(),user:pulled.user});return {ok:true,logged:true,user:pulled.user}
}
async function cloudAutoSync(){
  if(!cloudAuth())return false;
  if(cloudSyncInFlight)return cloudSyncInFlight;
  const sync=$('cloudSyncState');if(sync)sync.textContent='Синхронизация…';
  cloudSyncInFlight=(async()=>{try{const result=await cloudSync();if(sync)sync.textContent=result?.ok?'Синхронизировано':'Ожидание сети';refreshCloudUI();return !!result?.ok}catch(e){if(sync)sync.textContent=('onLine' in navigator&&navigator.onLine===false)?'Ожидание сети':'Повтор при подключении';refreshCloudUI();return false}})();
  try{return await cloudSyncInFlight}finally{cloudSyncInFlight=null}
}
