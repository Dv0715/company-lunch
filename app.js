const {createClient}=window.supabase;
const db=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
const dayNames=["日","一","二","三","四","五","六"];
let restaurants=[];
let excludedToday={date:new Date().toISOString().slice(0,10),ids:[]};
let lastDrawId=null;
let editMode=false;
let hoursState={};

const today=()=>new Date().getDay();
const isOpen=r=>!(r.closed_days||[]).includes(today());
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function closeModal(){document.getElementById("modal").classList.add("hidden")}
function openModal(html){document.getElementById("modalContent").innerHTML=html;document.getElementById("modal").classList.remove("hidden")}
async function hashPassword(password){const data=new TextEncoder().encode(password);const hash=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function getPasswordHash(){const {data,error}=await db.from("app_settings").select("admin_password_hash").eq("id",1).single();if(error)throw error;return data.admin_password_hash}
function toggleEditMode(){if(editMode){lockEditMode();return}openModal(`<h2>🔐 編輯模式</h2><div class="form-row"><label>管理密碼</label><input id="pwInput" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')submitPassword()"></div><p id="pwMsg" class="closed"></p><button class="primary" onclick="submitPassword()">解鎖</button>`);setTimeout(()=>document.getElementById("pwInput")?.focus(),50)}
async function submitPassword(){const msg=document.getElementById("pwMsg"),password=document.getElementById("pwInput").value;if(!password){msg.textContent="請輸入密碼";return}msg.textContent="驗證中…";try{const expected=await getPasswordHash();if(await hashPassword(password)!==expected){msg.textContent="密碼錯誤";return}editMode=true;document.getElementById("addRestaurantBtn").classList.remove("hidden");closeModal();document.getElementById("editBanner").classList.remove("hidden");document.getElementById("editModeBtn").textContent="🔓 編輯模式";render()}catch(e){msg.textContent="無法驗證管理密碼："+e.message}}
function lockEditMode(){editMode=false;document.getElementById("addRestaurantBtn").classList.add("hidden");document.getElementById("editBanner").classList.add("hidden");document.getElementById("editModeBtn").textContent="🔐 編輯模式";render()}
function requireEdit(){if(!editMode){alert("請先開啟編輯模式。");return false}return true}

function emptyHours(){return {0:{am:[],pm:[]},1:{am:[],pm:[]},2:{am:[],pm:[]},3:{am:[],pm:[]},4:{am:[],pm:[]},5:{am:[],pm:[]},6:{am:[],pm:[]}}}
function normalizeHours(raw){
 const out=emptyHours(); if(!raw)return out;
 // New stable format: {"1":{"am":[{"start":"10:00","end":"13:30"}],"pm":[...]}}
 if(typeof raw==="object"&&!Array.isArray(raw)){
  for(let d=0;d<7;d++){
   const x=raw[d]??raw[String(d)];
   if(x&&typeof x==="object"){
    for(const p of ["am","pm"]){if(Array.isArray(x[p])) out[d][p]=x[p].map(t=>({start:t.start||t.open||"",end:t.end||t.close||""})).filter(t=>t.start||t.end)}
    // tolerate a few older shapes
    if(!out[d].am.length&&!out[d].pm.length&&Array.isArray(x.times)){
      x.times.forEach(t=>{const item={start:t.start||t.open||"",end:t.end||t.close||""};(Number((item.start||"00:00").slice(0,2))<12?out[d].am:out[d].pm).push(item)})
    }
   }
  }
  return out;
 }
 // Older array shape: [{day,period,start,end}]
 if(Array.isArray(raw)) raw.forEach(t=>{const d=Number(t.day);if(d>=0&&d<7){const p=t.period==="am"?"am":(t.period==="pm"?"pm":(Number((t.start||"00:00").slice(0,2))<12?"am":"pm"));out[d][p].push({start:t.start||"",end:t.end||""})}});
 return out;
}
function getHours(r){return normalizeHours(r?.business_hours)}
function setHoursState(r){hoursState=getHours(r)}
function addHour(day,period){hoursState[day][period].push({start:"",end:""});renderHoursEditor()}
function removeHour(day,period,i){hoursState[day][period].splice(i,1);renderHoursEditor()}
function updateHour(day,period,i,key,val){hoursState[day][period][i][key]=val}
function copyHoursTo(day){const src=JSON.parse(JSON.stringify(hoursState[day]));openCopyDialog(day,src)}
function openCopyDialog(day,src){const others=[0,1,2,3,4,5,6].filter(d=>d!==day);openModal(`<h3>📋 複製星期${dayNames[day]}的營業時間</h3><div class="copy-box"><div class="muted">會完整複製「上午／下午」分組，不會重新判斷時間。</div><div class="copy-days">${others.map(d=>`<label><input class="copyDay" type="checkbox" value="${d}"> 星期${dayNames[d]}</label>`).join("")}</div><button class="primary" onclick='applyCopy(${day},${JSON.stringify(src)})'>套用</button> <button class="secondary" onclick='openHoursEditorBack()'>取消</button></div>`)}
function applyCopy(srcDay,src){document.querySelectorAll(".copyDay:checked").forEach(x=>{hoursState[Number(x.value)]=JSON.parse(JSON.stringify(src))});openHoursEditorBack()}
function openHoursEditorBack(){const base=window.currentEditingRestaurant;if(!base)return;const tmp={...base,business_hours:hoursState};openRestaurantForm(tmp)}
function renderPeriod(day,p, label){const rows=hoursState[day][p];return `<div class="hours-section"><div class="hours-section-head"><strong>${label}</strong><button class="secondary" onclick="addHour(${day},'${p}')">＋ 時段</button></div>${rows.length?rows.map((t,i)=>`<div class="hours-row"><input type="time" value="${esc(t.start)}" onchange="updateHour(${day},'${p}',${i},'start',this.value)"><span>～</span><input type="time" value="${esc(t.end)}" onchange="updateHour(${day},'${p}',${i},'end',this.value)"><button class="danger" onclick="removeHour(${day},'${p}',${i})">×</button></div>`).join(""):'<div class="hours-empty">尚未設定</div>'}</div>`}
function renderHoursEditor(){const el=document.getElementById("hoursEditor");if(!el)return;el.innerHTML=Object.keys(hoursState).map(d=>`<div class="hours-day"><div class="hours-day-head"><div class="hours-day-title"><label><input class="daybox" type="checkbox" value="${d}" ${document.querySelector(`.daybox[value="${d}"]`)?.checked?"checked":""} onchange="syncClosedDay(${d},this.checked)"> 星期${dayNames[d]}</label><span class="muted">${document.querySelector(`.daybox[value="${d}"]`)?.checked?"公休":""}</span></div><button class="secondary" onclick="copyHoursTo(${d})">複製到其他日期</button></div>${renderPeriod(Number(d),'am','上午時段')}${renderPeriod(Number(d),'pm','下午時段')}</div>`).join("")}
function syncClosedDay(d,checked){const box=document.querySelector(`.daybox[value="${d}"]`);if(box)box.checked=checked;const title=document.querySelector(`.hours-day:nth-child(${d+1}) .hours-day-title .muted`);if(title)title.textContent=checked?"公休":""}

async function load(){if(window.SUPABASE_URL.includes("YOUR-PROJECT")){document.getElementById("restaurantList").innerHTML='<div class="empty">請先在 config.js 填入 Supabase URL 與 Publishable Key。</div>';return}const {data,error}=await db.from("restaurants").select("*").order("name");if(error){document.getElementById("restaurantList").innerHTML=`<div class="empty">載入失敗：${esc(error.message)}</div>`;return}restaurants=data||[];render()}
function render(){document.getElementById("today").textContent=`今天是星期${dayNames[today()]}`;const q=document.getElementById("search").value.trim().toLowerCase(),only=document.getElementById("openOnly").checked;const list=restaurants.filter(r=>{if(only&&!isOpen(r))return false;return !q||[r.name,r.category,r.address,...(r.tags||[])].join(" ").toLowerCase().includes(q)});document.getElementById("count").textContent=`${list.length} 間`;document.getElementById("restaurantList").innerHTML=list.length?list.map(card).join(""):'<div class="empty">找不到符合的餐廳</div>'}
function card(r){return `<div class="card">${r.cover_url?`<img class="cover-thumb" src="${esc(r.cover_url)}" alt="${esc(r.name)}">`:`<div class="cover-placeholder">🍱</div>`}<div class="card-body"><h3>${esc(r.name)}</h3><div class="muted">${esc(r.category)}</div><p class="${isOpen(r)?"open":"closed"}">${isOpen(r)?"🟢 今日有營業":"🔴 今日公休"}</p><div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div><div class="card-actions"><button class="secondary" onclick="openRestaurant('${r.id}')">查看店家</button><button class="secondary" onclick="editRestaurant('${r.id}')">編輯</button></div></div></div>`}

async function openRestaurant(id){
 const r=restaurants.find(x=>x.id===id); if(!r)return;
 const [{data:notes},{data:images}]=await Promise.all([
  db.from("notes").select("*").eq("restaurant_id",id).order("pinned",{ascending:false}).order("created_at",{ascending:false}),
  db.from("menu_images").select("*").eq("restaurant_id",id).order("created_at",{ascending:false})
 ]);
 const hs=getHours(r), todayH=hs[today()]||{am:[],pm:[]}, menu=images||[];
 let html='';
 if(r.cover_url) html+=`<img class="detail-cover" src="${esc(r.cover_url)}">`;
 html+=`<h2>${esc(r.name)}</h2><p class="muted">${esc(r.category)}</p><p class="${isOpen(r)?"open":"closed"}">${isOpen(r)?"🟢 今日有營業":"🔴 今日公休"}</p>`;
 html+=`<div class="menu-hero"><h3>📷 菜單 ${menu.length?`<span class="menu-count">${menu.length} 張</span>`:""}</h3>`;
 html+=menu.length?`<img src="${esc(menu[0].public_url)}" onclick="window.open(this.src)">`:`<p class="muted">尚未上傳菜單</p>`;
 html+='</div>';
 if(menu.length>1) html+=`<div class="menu-images">${menu.slice(1).map(i=>`<img src="${esc(i.public_url)}" onclick="window.open(this.src)">`).join("")}</div>`;
 html+=`<p>📅 公休：${(r.closed_days||[]).length?r.closed_days.map(d=>"星期"+dayNames[d]).join("、"):"無固定公休"}</p>`;
 if(todayH.am.length||todayH.pm.length) html+=`<p>🕐 今日：${[...todayH.am,...todayH.pm].map(t=>`${esc(t.start)}～${esc(t.end)}`).join("、")}</p>`;
 if(r.address) html+=`<p>📍 ${esc(r.address)}</p>`;
 if(r.phone) html+=`<p>📞 ${esc(r.phone)}</p>`;
 html+=`<hr><h3>🏷️ 標籤</h3><div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")||'<span class="muted">尚無標籤</span>'}</div>`;
 html+=`<hr><h3>📝 小紙條</h3>${(notes||[]).map(n=>`<div class="note">${n.pinned?"📌 ":""}${esc(n.text)}<br><small>${esc(n.author||"匿名")} · ${new Date(n.created_at).toLocaleDateString("zh-TW")}</small><br>${editMode?`<button class="danger" onclick="deleteNote('${n.id}','${id}')">刪除</button>`:""}</div>`).join("")||'<p class="muted">還沒有紙條</p>'}`;
 if(editMode) html+=`<div class="inline"><input id="noteText" placeholder="寫下這家店的用餐心得…"><input id="noteAuthor" placeholder="名字（可不填）"></div><p><label><input id="notePin" type="checkbox"> 📌 置頂</label> <button class="primary" onclick="addNote('${id}')">＋ 留下紙條</button></p><hr><button class="danger" onclick="deleteRestaurant('${id}')">刪除餐廳</button>`;
 openModal(html);
}

async function uploadCover(id,file){if(!requireEdit()||!file)return;if(file.size>6*1024*1024){alert("封面超過 6MB，請先縮小圖片。");return}const ext=(file.name.split(".").pop()||"jpg").toLowerCase();const path=`covers/${id}-${crypto.randomUUID()}.${ext}`;const up=await db.storage.from("menu-images").upload(path,file,{contentType:file.type||"image/jpeg",upsert:false});if(up.error){alert(up.error.message);return}const {data}=db.storage.from("menu-images").getPublicUrl(path);const {error}=await db.from("restaurants").update({cover_url:data.publicUrl}).eq("id",id);if(error){alert(error.message);return}const r=restaurants.find(x=>x.id===id);if(r)r.cover_url=data.publicUrl;openRestaurantForm(r)}
async function clearCover(id){if(!requireEdit())return;if(!confirm("確定刪除店家封面？"))return;const {error}=await db.from("restaurants").update({cover_url:null}).eq("id",id);if(error){alert(error.message);return}const r=restaurants.find(x=>x.id===id);if(r)r.cover_url=null;openRestaurantForm(r)}
async function addImages(id,files){if(!requireEdit())return;for(const file of [...files]){if(file.size>6*1024*1024){alert(`${file.name} 超過 6MB，請先縮小圖片。`);continue}const ext=(file.name.split(".").pop()||"jpg").toLowerCase(),path=`${id}/${crypto.randomUUID()}.${ext}`;const up=await db.storage.from("menus").upload(path,file,{contentType:file.type||"image/jpeg"});if(up.error){alert(up.error.message);continue}const {data}=db.storage.from("menus").getPublicUrl(path);const ins=await db.from("menu_images").insert({restaurant_id:id,storage_path:path,public_url:data.publicUrl});if(ins.error)alert(ins.error.message)}const r=restaurants.find(x=>x.id===id);openRestaurantForm(r||null)}
async function deleteNote(nid,rid){if(!requireEdit())return;if(!confirm("刪除這張小紙條？"))return;const {error}=await db.from("notes").delete().eq("id",nid);if(error)alert(error.message);else openRestaurant(rid)}
async function addNote(id){if(!requireEdit())return;const text=document.getElementById("noteText").value.trim();if(!text)return;const {error}=await db.from("notes").insert({restaurant_id:id,text,author:document.getElementById("noteAuthor").value.trim(),pinned:document.getElementById("notePin").checked});if(error)alert(error.message);else openRestaurant(id)}

function openRestaurantForm(existing=null){if(!requireEdit())return;window.currentEditingRestaurant=existing;setHoursState(existing);const r=existing||{name:"",category:"",address:"",phone:"",closed_days:[],business_hours:emptyHours(),tags:[],cover_url:null};const closed=r.closed_days||[];openModal(`<h2>${existing?"編輯餐廳":"新增餐廳"}</h2><div class="form-row"><label>餐廳名稱</label><input id="fName" value="${esc(r.name)}"></div><div class="form-row"><label>類型</label><input id="fCategory" value="${esc(r.category)}" placeholder="便當、麵店、飲料…"></div><div class="form-row"><label>地址</label><input id="fAddress" value="${esc(r.address)}"></div><div class="form-row"><label>電話</label><input id="fPhone" value="${esc(r.phone)}"></div><div class="form-row"><label>店家封面</label><div class="cover-editor"><div>${r.cover_url?`<img class="cover-preview" src="${esc(r.cover_url)}">`:`<div class="cover-preview" style="display:flex;align-items:center;justify-content:center;font-size:2rem">🍱</div>`}</div><div><input type="file" accept="image/*" onchange="uploadCover('${existing?existing.id:""}',this.files[0])" ${existing?"":"disabled"}>${existing?`<p><button class="danger" onclick="clearCover('${existing.id}')">刪除封面</button></p>`:`<p class="muted">先儲存餐廳後即可上傳封面。</p>`}</div></div></div><div class="form-row"><label>公休日</label><div class="days">${dayNames.map((d,i)=>`<label><input class="daybox" type="checkbox" value="${i}" ${closed.includes(i)?"checked":""}> 星期${d}</label>`).join("")}</div></div><div class="form-row"><label>每週營業時間</label><div class="muted">可分上午／下午、每段都用 24 小時制；複製時會原樣複製，不會再重新判斷。</div><div id="hoursEditor"></div></div><div class="form-row"><label>標籤（逗號分隔）</label><input id="fTags" value="${esc((r.tags||[]).join(","))}" placeholder="水餃,便宜,適合一個人"></div>${existing?`<div class="form-row"><label>📷 菜單圖片</label><div id="editMenuImages" class="menu-images">載入中…</div><input type="file" accept="image/*" multiple onchange="addImages('${existing.id}',this.files)"><p class="muted">可以在同一個頁面直接新增菜單圖片。</p></div>`:""}<button class="primary" onclick="saveRestaurant('${existing?existing.id:""}')">儲存資料</button>`);renderHoursEditor();if(existing)loadEditMenuImages(existing.id)}
async function loadEditMenuImages(id){const el=document.getElementById("editMenuImages");if(!el)return;const {data,error}=await db.from("menu_images").select("*").eq("restaurant_id",id).order("created_at",{ascending:false});if(error){el.textContent=error.message;return}el.innerHTML=data?.length?data.map(i=>`<div><img src="${esc(i.public_url)}" onclick="window.open(this.src)"><button class="danger" onclick="deleteMenuImage('${i.id}','${id}')">刪除</button></div>`).join(""):'<p class="muted">尚未上傳菜單</p>'}
async function deleteMenuImage(imageId,id){if(!requireEdit())return;if(!confirm("刪除這張菜單？"))return;const {error}=await db.from("menu_images").delete().eq("id",imageId);if(error){alert(error.message);return}loadEditMenuImages(id)}
function editRestaurant(id){if(requireEdit())openRestaurantForm(restaurants.find(r=>r.id===id))}
async function saveRestaurant(id){if(!requireEdit())return;const closed=[...document.querySelectorAll(".daybox:checked")].map(x=>Number(x.value));const cleanHours=JSON.parse(JSON.stringify(hoursState));Object.values(cleanHours).forEach(d=>["am","pm"].forEach(p=>d[p]=d[p].filter(t=>t.start&&t.end)));const data={name:document.getElementById("fName").value.trim(),category:document.getElementById("fCategory").value.trim(),address:document.getElementById("fAddress").value.trim(),phone:document.getElementById("fPhone").value.trim(),closed_days:closed,business_hours:cleanHours,tags:document.getElementById("fTags").value.split(",").map(x=>x.trim()).filter(Boolean)};if(!data.name)return alert("請輸入餐廳名稱");const result=id?await db.from("restaurants").update(data).eq("id",id).select().single():await db.from("restaurants").insert(data).select().single();if(result.error){alert(result.error.message);return}if(id){const idx=restaurants.findIndex(r=>r.id===id);if(idx>=0)restaurants[idx]=result.data;closeModal();render()}else{restaurants.push(result.data);closeModal();render();openRestaurantForm(result.data)}}
async function deleteRestaurant(id){if(!requireEdit())return;if(!confirm("確定刪除這間餐廳？相關紙條與菜單紀錄也會刪除。"))return;const {error}=await db.from("restaurants").delete().eq("id",id);if(error)alert(error.message);else{restaurants=restaurants.filter(r=>r.id!==id);closeModal();render()}}
function drawPool(){const q=document.getElementById("search").value.trim().toLowerCase();return restaurants.filter(r=>isOpen(r)&&!excludedToday.ids.includes(r.id)&&(!q||[r.name,r.category,...(r.tags||[])].join(" ").toLowerCase().includes(q)))}
function drawRestaurant(){const pool=drawPool(),status=document.getElementById("drawStatus"),btn=document.getElementById("drawBtn");if(!pool.length){status.textContent="😵 沒有可抽選的餐廳！";return}btn.disabled=true;let n=0;const timer=setInterval(()=>{status.textContent=`🎰 ${pool[n++%pool.length].name}`;if(n>=12){clearInterval(timer);const c=pool.filter(r=>r.id!==lastDrawId),w=(c.length?c:pool)[Math.floor(Math.random()*(c.length?c.length:pool.length))];lastDrawId=w.id;status.textContent=`🎉 抽中了！ ${w.name}`;showDrawResult(w);btn.disabled=false}},100)}
function showDrawResult(r){document.getElementById("drawResult")?.remove();const e=document.createElement("div");e.id="drawResult";e.className="draw-result";e.innerHTML=`<div class="muted">今天就吃這家！</div><div class="winner">${esc(r.name)}</div><div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div><div class="actions"><button class="secondary" onclick="openRestaurant('${r.id}')">查看店家</button><button class="secondary" onclick="excludeToday('${r.id}')">🚫 今天先不要</button><button class="primary" onclick="drawRestaurant()">再抽一次</button></div>`;document.querySelector(".draw-card").after(e)}
function excludeToday(id){excludedToday.ids.push(id);document.getElementById("drawResult")?.remove();drawRestaurant()}
load();
