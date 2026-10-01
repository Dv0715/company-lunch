const {createClient}=window.supabase;
const db=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
const dayNames=["日","一","二","三","四","五","六"];
let restaurants=[];
let excludedToday={date:new Date().toISOString().slice(0,10),ids:[]};
let lastDrawId=null;

const today=()=>new Date().getDay();
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function normalizeBusinessHours(r){
  if(r.business_hours && typeof r.business_hours==="object" && Object.keys(r.business_hours).length){
    return r.business_hours;
  }
  const out={}, closed=new Set(r.closed_days||[]);
  for(let d=0;d<7;d++){
    out[d]=closed.has(d)?[]:(r.open_time&&r.close_time?[{open:r.open_time,close:r.close_time}]:[]);
  }
  return out;
}
function isOpen(r){
  const day=normalizeBusinessHours(r)[today()];
  return Array.isArray(day)&&day.length>0;
}
function formatHours(r,day=today()){
  return (normalizeBusinessHours(r)[day]||[]).map(x=>`${esc(x.open)}～${esc(x.close)}`).join("、");
}
function closeModal(){document.getElementById("modal").classList.add("hidden")}
function openModal(html){document.getElementById("modalContent").innerHTML=html;document.getElementById("modal").classList.remove("hidden")}

let editMode=false;
async function hashPassword(password){
  const data=new TextEncoder().encode(password);
  const hash=await crypto.subtle.digest("SHA-256",data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function getPasswordHash(){
  const {data,error}=await db.from("app_settings").select("admin_password_hash").eq("id",1).single();
  if(error) throw error;
  return data.admin_password_hash;
}
function toggleEditMode(){
  if(editMode){lockEditMode();return}
  openModal(`<h2>🔐 編輯模式</h2>
    <div class="form-row"><label>管理密碼</label>
    <input id="pwInput" type="password" autocomplete="current-password"
      onkeydown="if(event.key==='Enter')submitPassword()"></div>
    <p id="pwMsg" class="closed"></p>
    <button class="primary" onclick="submitPassword()">解鎖</button>`);
  setTimeout(()=>{const i=document.getElementById("pwInput");if(i)i.focus()},50);
}
async function submitPassword(){
  const msg=document.getElementById("pwMsg"),password=document.getElementById("pwInput").value;
  if(!password){msg.textContent="請輸入密碼";return}
  msg.textContent="驗證中…";
  try{
    const expected=await getPasswordHash();
    if(await hashPassword(password)!==expected){msg.textContent="密碼錯誤";return}
    editMode=true;
    document.getElementById("addRestaurantBtn").classList.remove("hidden");
    closeModal();
    document.getElementById("editBanner").classList.remove("hidden");
    document.getElementById("editModeBtn").textContent="🔓 編輯模式";
    render();
  }catch(e){
    msg.textContent="無法驗證管理密碼："+e.message;
  }
}
function lockEditMode(){
  editMode=false;
  document.getElementById("addRestaurantBtn").classList.add("hidden");
  document.getElementById("editBanner").classList.add("hidden");
  document.getElementById("editModeBtn").textContent="🔐 編輯模式";
  render();
}
function requireEdit(){
  if(!editMode){alert("請先開啟編輯模式。");return false}
  return true;
}

async function load(){
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes("YOUR-PROJECT")){
    document.getElementById("restaurantList").innerHTML='<div class="empty">請先在 config.js 填入 Supabase URL 與 Publishable Key。</div>';
    return;
  }
  const {data,error}=await db.from("restaurants").select("*").order("name");
  if(error){
    document.getElementById("restaurantList").innerHTML=`<div class="empty">載入失敗：${esc(error.message)}</div>`;
    return;
  }
  restaurants=data||[];
  render();
}

function render(){
  document.getElementById("today").textContent=`今天是星期${dayNames[today()]}`;
  const q=document.getElementById("search").value.trim().toLowerCase();
  const only=document.getElementById("openOnly").checked;
  const list=restaurants.filter(r=>{
    if(only&&!isOpen(r))return false;
    return !q||[r.name,r.category,r.address,...(r.tags||[])].join(" ").toLowerCase().includes(q);
  });
  document.getElementById("count").textContent=`${list.length} 間`;
  document.getElementById("restaurantList").innerHTML=list.length
    ?list.map(card).join("")
    :'<div class="empty">找不到符合的餐廳</div>';
}

function card(r){
  return `<div class="card">
    ${r.cover_url?`<div class="restaurant-cover"><img src="${esc(r.cover_url)}" alt="${esc(r.name)}封面" onclick="window.open(this.src,'_blank')"></div>`:""}
    <div class="card-body">
      <h3>${esc(r.name)}</h3>
      <div class="muted">${esc(r.category)}</div>
      <p class="${isOpen(r)?"open":"closed"}">${isOpen(r)?`🟢 今日有營業 ${formatHours(r)}`:"🔴 今日公休"}</p>
      <div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div>
      <div class="card-actions">
        <button class="secondary" onclick="openRestaurant('${r.id}')">查看店家</button>
        <button class="secondary" onclick="editRestaurant('${r.id}')">編輯</button>
      </div>
    </div>
  </div>`;
}

async function openRestaurant(id){
  const r=restaurants.find(x=>x.id===id);
  if(!r)return;
  const [{data:notes,error:notesError},{data:images,error:imagesError}]=await Promise.all([
    db.from("notes").select("*").eq("restaurant_id",id).order("pinned",{ascending:false}).order("created_at",{ascending:false}),
    db.from("menu_images").select("*").eq("restaurant_id",id).order("created_at",{ascending:false})
  ]);
  if(notesError||imagesError){
    alert("讀取店家資料失敗："+(notesError?.message||imagesError?.message));
    return;
  }

  const imageHtml=(images||[]).map(i=>`
    <div class="menu-image-wrap">
      <img src="${esc(i.public_url)}" alt="菜單" onclick="window.open(this.src,'_blank')">
      ${editMode?`<button class="danger menu-image-delete" onclick="deleteImage('${i.id}','${esc(i.storage_path)}','${id}')">刪除這張</button>`:""}
    </div>`).join("");

  openModal(`<div class="restaurant-detail-head">
      <h2>${esc(r.name)}</h2>
      <p class="muted">${esc(r.category)}</p>
      ${r.cover_url?`<div class="detail-cover"><img src="${esc(r.cover_url)}" alt="${esc(r.name)}封面" onclick="window.open(this.src,'_blank')"></div>`:""}
    </div>
    <section class="detail-menu-hero">
      <div class="detail-menu-title"><h3>📷 菜單</h3><span>${(images||[]).length} 張</span></div>
      <div class="detail-menu-gallery">${imageHtml||'<p class="muted detail-menu-empty">尚未上傳菜單</p>'}</div>
      ${editMode?`<div class="upload-box">
        <strong>📷 新增／更新菜單圖片</strong>
        <p class="muted">可一次選多張；單張上限 6MB。</p>
        <input type="file" accept="image/*" multiple onchange="addImages('${id}',this.files)">
        <p id="uploadStatus" class="muted"></p>
      </div>`:""}
      <p class="muted detail-menu-hint">點圖片可放大查看</p>
    </section>
    <section class="restaurant-detail-info">
      <p class="${isOpen(r)?"open":"closed"}">${isOpen(r)?"🟢 今日有營業":"🔴 今日公休"}</p>
      <p>📅 公休：${(r.closed_days||[]).length?r.closed_days.map(d=>"星期"+dayNames[d]).join("、"):"無固定公休"}</p>
      ${formatHours(r)?`<p>🕐 今日：${formatHours(r)}</p>`:"<p>🕐 今日：休息</p>"}
      ${r.address?`<p>📍 ${esc(r.address)}</p>`:""}
      ${r.phone?`<p>📞 ${esc(r.phone)}</p>`:""}
    </section>
    <hr><h3>🏷️ 標籤</h3>
    <div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")||'<span class="muted">尚無標籤</span>'}</div>
    <hr><h3>📝 小紙條</h3>
    ${(notes||[]).map(n=>`<div class="note">${n.pinned?"📌 ":""}${esc(n.text)}
      <br><small>${esc(n.author||"匿名")} · ${new Date(n.created_at).toLocaleDateString("zh-TW")}</small>
      ${editMode?`<br><button class="danger" onclick="deleteNote('${n.id}','${id}')">刪除</button>`:""}
    </div>`).join("")||'<p class="muted">還沒有紙條</p>'}
    ${editMode?`<div class="inline">
      <input id="noteText" placeholder="寫下這家店的用餐心得…">
      <input id="noteAuthor" placeholder="名字（可不填）">
    </div>
    <p><label><input id="notePin" type="checkbox"> 📌 置頂</label>
      <button class="primary" onclick="addNote('${id}')">＋ 留下紙條</button>
    </p>`:""}
    ${editMode?`<hr><button class="danger" onclick="deleteRestaurant('${id}')">刪除餐廳</button>`:""}`);
}

async function addNote(id){
  if(!requireEdit())return;
  const text=document.getElementById("noteText").value.trim();
  if(!text)return;
  const {error}=await db.from("notes").insert({
    restaurant_id:id,
    text,
    author:document.getElementById("noteAuthor").value.trim(),
    pinned:document.getElementById("notePin").checked
  });
  if(error)alert(error.message);else openRestaurant(id);
}
async function deleteNote(nid,rid){
  if(!requireEdit())return;
  if(!confirm("刪除這張小紙條？"))return;
  const {error}=await db.from("notes").delete().eq("id",nid);
  if(error)alert(error.message);else openRestaurant(rid);
}

async function addImages(id,files){
  if(!requireEdit())return;
  const list=[...files];
  if(!list.length)return;
  const status=document.getElementById("uploadStatus");
  if(status)status.textContent=`準備上傳 ${list.length} 張…`;

  let success=0;
  for(const file of list){
    if(file.size>6*1024*1024){
      alert(`${file.name} 超過 6MB，請先縮小圖片。`);
      continue;
    }
    if(!file.type.startsWith("image/")){
      alert(`${file.name} 不是圖片檔。`);
      continue;
    }
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`${id}/${crypto.randomUUID()}.${ext}`;
    const up=await db.storage.from("menus").upload(path,file,{
      contentType:file.type||"image/jpeg",
      upsert:false
    });
    if(up.error){
      alert(`上傳 ${file.name} 失敗：${up.error.message}`);
      continue;
    }
    const {data}=db.storage.from("menus").getPublicUrl(path);
    const ins=await db.from("menu_images").insert({
      restaurant_id:id,
      storage_path:path,
      public_url:data.publicUrl
    });
    if(ins.error){
      // DB 紀錄失敗時，順便把已上傳的檔案清掉，避免留下孤兒檔。
      await db.storage.from("menus").remove([path]);
      alert(`圖片紀錄建立失敗：${ins.error.message}`);
      continue;
    }
    success++;
    if(status)status.textContent=`已上傳 ${success}/${list.length} 張…`;
  }
  openRestaurant(id);
}

async function deleteImage(imageId,storagePath,rid){
  if(!requireEdit())return;
  if(!confirm("確定刪除這張菜單圖片？"))return;

  const fileResult=await db.storage.from("menus").remove([storagePath]);
  if(fileResult.error){
    alert("刪除圖片檔案失敗："+fileResult.error.message);
    return;
  }
  const {error}=await db.from("menu_images").delete().eq("id",imageId);
  if(error){
    alert("圖片已從儲存空間刪除，但資料紀錄刪除失敗："+error.message);
    return;
  }
  openRestaurant(rid);
}

function checkDuplicateContact(existingId=""){
  const address = document.getElementById("fAddress")?.value.trim();
  const phone = document.getElementById("fPhone")?.value.trim();
  const matches = restaurants.filter(r => r.id !== existingId).filter(r =>
    (address && r.address?.trim() === address) ||
    (phone && r.phone?.trim() === phone)
  );
  const box = document.getElementById("duplicateWarning");
  if(!box) return;
  if(!matches.length){
    box.innerHTML = '<span class="ok-text">✓ 目前沒有發現相同的地址或電話</span>';
    return;
  }
  box.innerHTML = `<strong>⚠️ 可能重複</strong><br>` +
    matches.map(r => {
      const sameAddress = address && r.address?.trim() === address;
      const samePhone = phone && r.phone?.trim() === phone;
      return `<div class="duplicate-item">
        <b>${esc(r.name)}</b>
        ${sameAddress ? '<span>地址相同</span>' : ''}
        ${samePhone ? '<span>電話相同</span>' : ''}
      </div>`;
    }).join("");
}

function getHoursFromForm(){
  const out={};
  for(let d=0;d<7;d++){
    const closed=!!document.getElementById(`closed_${d}`)?.checked;
    const rows=[...document.querySelectorAll(`.hours-row[data-day="${d}"]`)];
    out[d]=closed?[]:rows.map(row=>({
      open:row.querySelector(".hour-open").value,
      close:row.querySelector(".hour-close").value
    })).filter(x=>x.open&&x.close);
  }
  return out;
}
function addHoursRow(day,open="",close=""){
  const wrap=document.getElementById(`hours_${day}`);
  if(!wrap)return;
  const row=document.createElement("div");
  row.className="hours-row"; row.dataset.day=day;
  row.innerHTML=`<input class="hour-open" type="time" value="${esc(open)}">
    <span>～</span>
    <input class="hour-close" type="time" value="${esc(close)}">
    <button type="button" class="remove-hours" onclick="this.parentElement.remove()">×</button>`;
  wrap.appendChild(row);
}
function toggleDayHours(day){
  const closed=document.getElementById(`closed_${day}`)?.checked;
  document.getElementById(`hours_${day}`)?.classList.toggle("hours-disabled",!!closed);
}
function renderHoursEditor(r){
  const hours=normalizeBusinessHours(r);
  return `<section class="hours-panel">
    <div class="section-title-row"><div>
      <h3>🕐 每週營業時間</h3>
      <div class="muted">每天可設定多個時段，例如 10:00～14:00、17:00～21:00。</div>
    </div></div>
    <div class="weekly-hours">
      ${dayNames.map((name,d)=>{
        const dayHours=Array.isArray(hours[d])?hours[d]:[];
        const closed=(r.closed_days||[]).includes(d)||dayHours.length===0;
        const rows=dayHours.length?dayHours:[{open:"",close:""}];
        return `<div class="day-hours-card">
          <div class="day-hours-head">
            <label class="day-closed-label">
              <input id="closed_${d}" type="checkbox" ${closed?"checked":""} onchange="toggleDayHours(${d})">
              <strong>星期${name}</strong><span>公休</span>
            </label>
            <button type="button" class="add-hours" onclick="addHoursRow(${d})">＋ 時段</button>
          </div>
          <div id="hours_${d}" class="hours-list ${closed?"hours-disabled":""}">
            ${rows.map(x=>`<div class="hours-row" data-day="${d}">
              <input class="hour-open" type="time" value="${esc(x.open)}">
              <span>～</span>
              <input class="hour-close" type="time" value="${esc(x.close)}">
              <button type="button" class="remove-hours" onclick="this.parentElement.remove()">×</button>
            </div>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>
  </section>`;
}

async function openRestaurantForm(existing=null){
  if(!requireEdit())return;
  const r=existing||{name:"",category:"",address:"",phone:"",closed_days:[],open_time:"",close_time:"",tags:[],business_hours:{}};

  let images=[];
  if(existing){
    const {data,error}=await db.from("menu_images").select("*").eq("restaurant_id",existing.id).order("created_at",{ascending:false});
    if(!error)images=data||[];
  }

  const coverSection=`<section class="edit-cover-panel">
    <div class="section-title-row"><div>
      <h3>🖼️ 店家封面</h3><div class="muted">這張照片會顯示在餐廳列表上；不是菜單。</div>
    </div></div>
    <div id="coverPreview" class="cover-preview">
      ${r.cover_url?`<img src="${esc(r.cover_url)}" alt="店家封面" onclick="window.open(this.src,'_blank')">`:'<div class="cover-empty">尚未設定店家封面</div>'}
    </div>
    <div class="upload-row">
      <input id="coverFile" type="file" accept="image/*">
      <button type="button" class="primary" onclick="${existing?`uploadCover('${existing.id}')`:`saveThenUploadCover()`}">${existing?"上傳／更換封面":"先儲存再上傳封面"}</button>
    </div>
    <p id="coverUploadStatus" class="muted"></p>
    ${r.cover_url?`<button type="button" class="danger" onclick="removeCover('${existing?.id||""}')">刪除封面</button>`:""}
  </section>`;

  const imageSection=`<section class="edit-images-panel">
    <div class="section-title-row"><div>
      <h3>📷 菜單圖片</h3><div class="muted">一邊編輯資料，一邊查看／上傳菜單。</div>
    </div><span class="image-count">${images.length} 張</span></div>
    <div class="menu-images edit-gallery">
      ${images.map(i=>`<div class="menu-image-wrap">
        <img src="${esc(i.public_url)}" alt="菜單" onclick="window.open(this.src,'_blank')">
        <button type="button" class="danger menu-image-delete" onclick="deleteImage('${i.id}','${esc(i.storage_path)}','${existing?.id||""}')">刪除</button>
      </div>`).join("")||'<div class="empty-image">目前尚未上傳菜單圖片</div>'}
    </div>
    <div class="upload-box">
      <strong>＋ 上傳菜單圖片</strong><p class="muted">可一次選擇多張圖片，單張上限 6MB。</p>
      <div class="upload-row">
        <input id="editMenuFiles" type="file" accept="image/*" multiple>
        <button type="button" class="primary" onclick="${existing?`uploadFromRestaurantForm('${existing.id}')`:`saveThenUploadRestaurant()`}">
          ${existing?"上傳選取的圖片":"先儲存並上傳"}
        </button>
      </div>
      <p id="editUploadStatus" class="muted"></p>
    </div>
  </section>`;

  openModal(`<div class="edit-form-layout">
    <div class="edit-info-panel">
      <h2>${existing?"編輯餐廳":"新增餐廳"}</h2>
      <div class="form-row"><label>餐廳名稱</label><input id="fName" value="${esc(r.name)}" oninput="checkDuplicateContact('${existing?.id||""}')"></div>
      <div class="form-row"><label>類型</label><input id="fCategory" value="${esc(r.category)}" placeholder="便當、麵店、飲料…"></div>
      <div class="form-row"><label>地址</label><input id="fAddress" value="${esc(r.address)}" oninput="checkDuplicateContact('${existing?.id||""}')"></div>
      <div class="form-row"><label>電話</label><input id="fPhone" value="${esc(r.phone)}" oninput="checkDuplicateContact('${existing?.id||""}')"></div>
      <div id="duplicateWarning" class="duplicate-warning"></div>
      ${renderHoursEditor(r)}
      <div class="form-row"><label>標籤（逗號分隔）</label>
        <input id="fTags" value="${esc((r.tags||[]).join(","))}" placeholder="水餃,便宜,適合一個人">
      </div>
      <div class="form-actions">
        <button class="primary" onclick="saveRestaurant('${existing?.id||""}')">儲存資料</button>
        <button class="secondary" onclick="closeModal()">取消</button>
      </div>
    </div>
    <div class="edit-image-column">${coverSection}${imageSection}</div>
  </div>`);
  setTimeout(()=>checkDuplicateContact('${existing?.id||""}'),0);
}

async function uploadCover(id){
  if(!requireEdit())return;
  const input=document.getElementById("coverFile"), status=document.getElementById("coverUploadStatus");
  const file=input?.files?.[0];
  if(!file){if(status)status.textContent="請先選擇封面圖片。";return}
  if(file.size>6*1024*1024){alert("封面圖片超過 6MB，請先縮小圖片。");return}
  if(!file.type.startsWith("image/")){alert("請選擇圖片檔。");return}
  if(status)status.textContent="上傳封面中…";
  const path=`${id}/cover`;
  const up=await db.storage.from("menus").upload(path,file,{contentType:file.type||"image/jpeg",upsert:true,cacheControl:"3600"});
  if(up.error){if(status)status.textContent=`上傳失敗：${up.error.message}`;return}
  const {data}=db.storage.from("menus").getPublicUrl(path);
  const url=data.publicUrl + `?v=${Date.now()}`;
  const {error}=await db.from("restaurants").update({cover_url:url}).eq("id",id);
  if(error){await db.storage.from("menus").remove([path]);if(status)status.textContent=`儲存封面網址失敗：${error.message}`;return}
  if(status)status.textContent="封面已更新。";
  await load();
  openRestaurantForm(restaurants.find(r=>r.id===id));
}
async function saveThenUploadCover(){
  if(!requireEdit())return;
  const data=collectRestaurantFormData();
  if(!data.name){alert("請先輸入餐廳名稱");return}
  const {data:created,error}=await db.from("restaurants").insert(data).select().single();
  if(error){alert(error.message);return}
  await load();
  const file=document.getElementById("coverFile")?.files?.[0];
  openRestaurantForm(restaurants.find(r=>r.id===created.id));
  if(file) document.getElementById("coverUploadStatus").textContent="餐廳已建立。請重新選取封面後按「上傳／更換封面」。";
}
async function removeCover(id){
  if(!requireEdit()||!id)return;
  if(!confirm("確定刪除這張店家封面？"))return;
  const fileResult=await db.storage.from("menus").remove([`${id}/cover`]);
  if(fileResult.error){alert("刪除封面檔案失敗："+fileResult.error.message);return}
  const {error}=await db.from("restaurants").update({cover_url:null}).eq("id",id);
  if(error){alert("封面檔案已刪除，但資料更新失敗："+error.message);return}
  await load();
  openRestaurantForm(restaurants.find(r=>r.id===id));
}

async function uploadFromRestaurantForm(id){
  if(!requireEdit())return;
  const input=document.getElementById("editMenuFiles");
  const status=document.getElementById("editUploadStatus");

  if(!input || !input.files.length){
    if(status)status.textContent="請先選擇圖片。";
    return;
  }

  const files=[...input.files];
  let success=0;
  if(status)status.textContent=`準備上傳 ${files.length} 張…`;

  for(const file of files){
    if(file.size>6*1024*1024){
      alert(`${file.name} 超過 6MB，請先縮小圖片。`);
      continue;
    }
    if(!file.type.startsWith("image/")){
      alert(`${file.name} 不是圖片檔。`);
      continue;
    }

    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`${id}/${crypto.randomUUID()}.${ext}`;

    const up=await db.storage.from("menus").upload(path,file,{
      contentType:file.type||"image/jpeg",
      upsert:false
    });

    if(up.error){
      alert(`上傳 ${file.name} 失敗：${up.error.message}`);
      continue;
    }

    const {data}=db.storage.from("menus").getPublicUrl(path);
    const ins=await db.from("menu_images").insert({
      restaurant_id:id,
      storage_path:path,
      public_url:data.publicUrl
    });

    if(ins.error){
      await db.storage.from("menus").remove([path]);
      alert(`圖片紀錄建立失敗：${ins.error.message}`);
      continue;
    }

    success++;
    if(status)status.textContent=`已上傳 ${success}/${files.length} 張…`;
  }

  await load();
  openRestaurantForm(restaurants.find(r=>r.id===id));
}

function collectRestaurantFormData(){
  const business_hours=getHoursFromForm(), closed_days=[];
  for(let d=0;d<7;d++) if(document.getElementById(`closed_${d}`)?.checked) closed_days.push(d);
  const allSlots=Object.values(business_hours).flat();
  return {
    name:document.getElementById("fName").value.trim(),
    category:document.getElementById("fCategory").value.trim(),
    address:document.getElementById("fAddress").value.trim(),
    phone:document.getElementById("fPhone").value.trim(),
    closed_days,business_hours,
    open_time:allSlots[0]?.open||"", close_time:allSlots[0]?.close||"",
    tags:document.getElementById("fTags").value.split(",").map(x=>x.trim()).filter(Boolean)
  };
}
async function saveThenUploadRestaurant(){
  if(!requireEdit())return;
  const data=collectRestaurantFormData();
  if(!data.name){alert("請輸入餐廳名稱");return}
  const {data:created,error}=await db.from("restaurants").insert(data).select().single();
  if(error){alert(error.message);return}
  await load();
  openRestaurantForm(restaurants.find(r=>r.id===created.id));
  const status=document.getElementById("editUploadStatus");
  if(status)status.textContent="餐廳已建立；請重新選取圖片後按「上傳選取的圖片」。";
}

function editRestaurant(id){if(requireEdit())openRestaurantForm(restaurants.find(r=>r.id===id))}
async function saveRestaurant(id){
  if(!requireEdit())return;
  const data=collectRestaurantFormData();
  if(!data.name)return alert("請輸入餐廳名稱");
  const result=id?await db.from("restaurants").update(data).eq("id",id):await db.from("restaurants").insert(data);
  if(result.error)alert(result.error.message); else {closeModal();await load()}
}

async function deleteRestaurant(id){
  if(!requireEdit())return;
  if(!confirm("確定刪除這間餐廳？相關紙條與菜單紀錄也會刪除。"))return;

  // 先清掉 Storage 裡的實體圖片，避免刪除餐廳後留下檔案。
  const {data:images,error:imageReadError}=await db.from("menu_images").select("storage_path").eq("restaurant_id",id);
  if(imageReadError){alert("讀取圖片紀錄失敗："+imageReadError.message);return}
  const paths=(images||[]).map(x=>x.storage_path).filter(Boolean);
  paths.push(`${id}/cover`);
  if(paths.length){
    const {error:removeError}=await db.storage.from("menus").remove(paths);
    if(removeError){alert("刪除圖片檔案失敗："+removeError.message);return}
  }

  const {error}=await db.from("restaurants").delete().eq("id",id);
  if(error)alert(error.message);
  else{closeModal();await load()}
}

function drawPool(){
  const q=document.getElementById("search").value.trim().toLowerCase();
  return restaurants.filter(r=>isOpen(r)&&!excludedToday.ids.includes(r.id)&&
    (!q||[r.name,r.category,...(r.tags||[])].join(" ").toLowerCase().includes(q)));
}
function drawRestaurant(){
  const pool=drawPool(),status=document.getElementById("drawStatus"),btn=document.getElementById("drawBtn");
  if(!pool.length){status.textContent="😵 沒有可抽選的餐廳！";return}
  btn.disabled=true;
  let n=0;
  const timer=setInterval(()=>{
    status.textContent=`🎰 ${pool[n++%pool.length].name}`;
    if(n>=12){
      clearInterval(timer);
      const c=pool.filter(r=>r.id!==lastDrawId);
      const w=(c.length?c:pool)[Math.floor(Math.random()*(c.length?c.length:pool.length))];
      lastDrawId=w.id;
      status.textContent=`🎉 抽中了！ ${w.name}`;
      showDrawResult(w);
      btn.disabled=false;
    }
  },100);
}
function showDrawResult(r){
  document.getElementById("drawResult")?.remove();
  const e=document.createElement("div");
  e.id="drawResult";
  e.className="draw-result";
  e.innerHTML=`<div class="muted">今天就吃這家！</div>
    <div class="winner">${esc(r.name)}</div>
    <div>${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div>
    <div class="actions">
      <button class="secondary" onclick="openRestaurant('${r.id}')">查看店家</button>
      <button class="secondary" onclick="excludeToday('${r.id}')">🚫 今天先不要</button>
      <button class="primary" onclick="drawRestaurant()">再抽一次</button>
    </div>`;
  document.querySelector(".draw-card").after(e);
}
function excludeToday(id){
  excludedToday.ids.push(id);
  document.getElementById("drawResult")?.remove();
  drawRestaurant();
}
load();
