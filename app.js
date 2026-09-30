const {createClient}=window.supabase;
const supabase=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
const dayNames=["日","一","二","三","四","五","六"];
let restaurants=[];
let excludedToday={date:new Date().toISOString().slice(0,10),ids:[]};
let lastDrawId=null;

const today=()=>new Date().getDay();
const isOpen=r=>!(r.closed_days||[]).includes(today());
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function closeModal(){document.getElementById("modal").classList.add("hidden")}
function openModal(html){document.getElementById("modalContent").innerHTML=html;document.getElementById("modal").classList.remove("hidden")}


let editMode=false;
async function hashPassword(password){
 const data=new TextEncoder().encode(password);
 const hash=await crypto.subtle.digest("SHA-256",data);
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function getPasswordHash(){
 const {data,error}=await supabase.from("app_settings").select("admin_password_hash").eq("id",1).single();
 if(error) throw error; return data.admin_password_hash;
}
function toggleEditMode(){
 if(editMode){lockEditMode();return}
 openModal(`<h2>🔐 編輯模式</h2><div class="form-row"><label>管理密碼</label><input id="pwInput" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')submitPassword()"></div><p id="pwMsg" class="closed"></p><button class="primary" onclick="submitPassword()">解鎖</button>`);
 setTimeout(()=>{const i=document.getElementById("pwInput");if(i)i.focus()},50);
}
async function submitPassword(){
 const msg=document.getElementById("pwMsg"),password=document.getElementById("pwInput").value;
 if(!password){msg.textContent="請輸入密碼";return}
 msg.textContent="驗證中…";
 try{
  const expected=await getPasswordHash();
  if(expected==="HASH_HERE"){msg.textContent="尚未設定管理密碼。請先到 Supabase 的 app_settings 設定 hash。";return}
  if(await hashPassword(password)!==expected){msg.textContent="密碼錯誤";return}
  editMode=true;
  closeModal();
  document.getElementById("editBanner").classList.remove("hidden");
  document.getElementById("editModeBtn").textContent="🔓 編輯模式";
  render();
 }catch(e){msg.textContent="無法驗證管理密碼："+e.message}
}
function lockEditMode(){
 editMode=false;
 document.getElementById("editBanner").classList.add("hidden");
 document.getElementById("editModeBtn").textContent="🔐 編輯模式";
 render();
}
function requireEdit(){if(!editMode){alert("請先開啟編輯模式。");return false}return true}

async function load(){
  if(window.SUPABASE_URL.includes("YOUR-PROJECT")) {
    document.getElementById("restaurantList").innerHTML='<div class="empty">請先在 config.js 填入 Supabase URL 與 Publishable Key。</div>'; return;
  }
  const {data,error}=await supabase.from("restaurants").select("*").order("name");
  if(error){document.getElementById("restaurantList").innerHTML=`<div class="empty">載入失敗：${esc(error.message)}</div>`;return}
  restaurants=data||[]; render();
}
function render(){
  document.getElementById("today").textContent=`今天是星期${dayNames[today()]}`;
  const q=document.getElementById("search").value.trim().toLowerCase(), only=document.getElementById("openOnly").checked;
  const list=restaurants.filter(r=>{
    if(only&&!isOpen(r))return false;
    return !q||[r.name,r.category,r.address,...(r.tags||[])].join(" ").toLowerCase().includes(q);
  });
  document.getElementById("count").textContent=`${list.length} 間`;
  document.getElementById("restaurantList").innerHTML=list.length?list.map(card).join(""):'<div class="empty">找不到符合的餐廳</div>';
}
function card(r){return `<div class="card"><h3>${esc(r.name)}</h3><div class="muted">${esc(r.category)}</div><p class="${isOpen(r)?"open":"closed"}">${isOpen(r)?"🟢 今日有營業":"🔴 今日公休"}</p><div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div><div class="card-actions"><button class="secondary" onclick="openRestaurant('${r.id}')">查看店家</button><button class="secondary" onclick="editRestaurant('${r.id}')">編輯</button></div></div>`}

async function openRestaurant(id){
  const r=restaurants.find(x=>x.id===id); if(!r)return;
  const [{data:notes},{data:images}]=await Promise.all([
    supabase.from("notes").select("*").eq("restaurant_id",id).order("pinned",{ascending:false}).order("created_at",{ascending:false}),
    supabase.from("menu_images").select("*").eq("restaurant_id",id).order("created_at",{ascending:false})
  ]);
  openModal(`<h2>${esc(r.name)}</h2><p class="muted">${esc(r.category)}</p><p class="${isOpen(r)?"open":"closed"}">${isOpen(r)?"🟢 今日有營業":"🔴 今日公休"}</p>
  <p>📅 公休：${(r.closed_days||[]).length?r.closed_days.map(d=>"星期"+dayNames[d]).join("、"):"無固定公休"}</p>
  ${r.open_time?`<p>🕐 ${esc(r.open_time)}～${esc(r.close_time)}</p>`:""}${r.address?`<p>📍 ${esc(r.address)}</p>`:""}${r.phone?`<p>📞 ${esc(r.phone)}</p>`:""}
  <hr><h3>🏷️ 標籤</h3><div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")||'<span class="muted">尚無標籤</span>'}</div>
  <hr><h3>📝 小紙條</h3>${(notes||[]).map(n=>`<div class="note">${n.pinned?"📌 ":""}${esc(n.text)}<br><small>${esc(n.author||"匿名")} · ${new Date(n.created_at).toLocaleDateString("zh-TW")}</small><br>${editMode?`<button class="danger" onclick="deleteNote('${n.id}','${id}')">刪除</button>`:""}</div>`).join("")||'<p class="muted">還沒有紙條</p>'}
  ${editMode?`<div class="inline"><input id="noteText" placeholder="寫下這家店的用餐心得…"><input id="noteAuthor" placeholder="名字（可不填）"></div><p><label><input id="notePin" type="checkbox"> 📌 置頂</label> <button class="primary" onclick="addNote('${id}')">＋ 留下紙條</button></p>`:""}
  <hr><h3>📷 菜單照片</h3><div class="menu-images">${(images||[]).map(i=>`<img src="${esc(i.public_url)}" onclick="window.open(this.src)">`).join("")||'<p class="muted">尚未上傳菜單</p>'}</div>
  ${editMode?`<input type="file" accept="image/*" multiple onchange="addImages('${id}',this.files)">`:""}<p class="muted">直接看菜單照片；Tag 用來搜尋品項與店家特色。</p>
  ${editMode?`<hr><button class="danger" onclick="deleteRestaurant('${id}')">刪除餐廳</button>`:""}`);
}
async function addNote(id){if(!requireEdit())return;const text=document.getElementById("noteText").value.trim();if(!text)return;const {error}=await supabase.from("notes").insert({restaurant_id:id,text,author:document.getElementById("noteAuthor").value.trim(),pinned:document.getElementById("notePin").checked});if(error)alert(error.message);else openRestaurant(id)}
async function deleteNote(nid,rid){if(!requireEdit())return;if(!confirm("刪除這張小紙條？"))return;const {error}=await supabase.from("notes").delete().eq("id",nid);if(error)alert(error.message);else openRestaurant(rid)}
async function addImages(id,files){if(!requireEdit())return;for(const file of [...files]){if(file.size>6*1024*1024){alert(`${file.name} 超過 6MB，請先縮小圖片。`);continue}const ext=(file.name.split(".").pop()||"jpg").toLowerCase(), path=`${id}/${crypto.randomUUID()}.${ext}`;const up=await supabase.storage.from("menus").upload(path,file,{contentType:file.type||"image/jpeg"});if(up.error){alert(up.error.message);continue}const {data}=supabase.storage.from("menus").getPublicUrl(path);const ins=await supabase.from("menu_images").insert({restaurant_id:id,storage_path:path,public_url:data.publicUrl});if(ins.error)alert(ins.error.message)}openRestaurant(id)}
function openRestaurantForm(existing=null){
 const r=existing||{name:"",category:"",address:"",phone:"",closed_days:[],open_time:"",close_time:"",tags:[]};
 openModal(`<h2>${existing?"編輯餐廳":"新增餐廳"}</h2><div class="form-row"><label>餐廳名稱</label><input id="fName" value="${esc(r.name)}"></div><div class="form-row"><label>類型</label><input id="fCategory" value="${esc(r.category)}" placeholder="便當、麵店、飲料…"></div><div class="form-row"><label>地址</label><input id="fAddress" value="${esc(r.address)}"></div><div class="form-row"><label>電話</label><input id="fPhone" value="${esc(r.phone)}"></div><div class="form-row"><label>公休日</label><div class="days">${dayNames.map((d,i)=>`<label><input class="daybox" type="checkbox" value="${i}" ${(r.closed_days||[]).includes(i)?"checked":""}> 星期${d}</label>`).join("")}</div></div><div class="form-row"><label>營業時間</label><div class="inline"><input id="fOpen" type="time" value="${esc(r.open_time)}"><input id="fClose" type="time" value="${esc(r.close_time)}"></div></div><div class="form-row"><label>標籤（逗號分隔）</label><input id="fTags" value="${esc((r.tags||[]).join(","))}" placeholder="水餃,便宜,適合一個人"></div><button class="primary" onclick="saveRestaurant('${existing?existing.id:""}')">儲存</button>`);
}
function editRestaurant(id){if(requireEdit())openRestaurantForm(restaurants.find(r=>r.id===id))}
async function saveRestaurant(id){if(!requireEdit())return;
 const data={name:document.getElementById("fName").value.trim(),category:document.getElementById("fCategory").value.trim(),address:document.getElementById("fAddress").value.trim(),phone:document.getElementById("fPhone").value.trim(),closed_days:[...document.querySelectorAll(".daybox:checked")].map(x=>Number(x.value)),open_time:document.getElementById("fOpen").value,close_time:document.getElementById("fClose").value,tags:document.getElementById("fTags").value.split(",").map(x=>x.trim()).filter(Boolean)};
 if(!data.name)return alert("請輸入餐廳名稱");
 const result=id?await supabase.from("restaurants").update(data).eq("id",id):await supabase.from("restaurants").insert(data);
 if(result.error)alert(result.error.message);else{closeModal();await load()}
}
async function deleteRestaurant(id){if(!requireEdit())return;if(!confirm("確定刪除這間餐廳？相關紙條與菜單紀錄也會刪除。"))return;const {error}=await supabase.from("restaurants").delete().eq("id",id);if(error)alert(error.message);else{closeModal();await load()}}
function drawPool(){const q=document.getElementById("search").value.trim().toLowerCase();return restaurants.filter(r=>isOpen(r)&&!excludedToday.ids.includes(r.id)&&(!q||[r.name,r.category,...(r.tags||[])].join(" ").toLowerCase().includes(q)))}
function drawRestaurant(){const pool=drawPool(),status=document.getElementById("drawStatus"),btn=document.getElementById("drawBtn");if(!pool.length){status.textContent="😵 沒有可抽選的餐廳！";return}btn.disabled=true;let n=0;const timer=setInterval(()=>{status.textContent=`🎰 ${pool[n++%pool.length].name}`;if(n>=12){clearInterval(timer);const c=pool.filter(r=>r.id!==lastDrawId),w=(c.length?c:pool)[Math.floor(Math.random()*(c.length?c.length:pool.length))];lastDrawId=w.id;status.textContent=`🎉 抽中了！ ${w.name}`;showDrawResult(w);btn.disabled=false}},100)}
function showDrawResult(r){document.getElementById("drawResult")?.remove();const e=document.createElement("div");e.id="drawResult";e.className="draw-result";e.innerHTML=`<div class="muted">今天就吃這家！</div><div class="winner">${esc(r.name)}</div><div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div><div class="actions"><button class="secondary" onclick="openRestaurant('${r.id}')">查看店家</button><button class="secondary" onclick="excludeToday('${r.id}')">🚫 今天先不要</button><button class="primary" onclick="drawRestaurant()">再抽一次</button></div>`;document.querySelector(".draw-card").after(e)}
function excludeToday(id){excludedToday.ids.push(id);showDrawResult({name:""});document.getElementById("drawResult")?.remove();drawRestaurant()}
load();
