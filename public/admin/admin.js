// Shared helpers for all admin pages.
const money = n => '$' + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function api(path, opts={}){
  const res = await fetch(path, { credentials:'same-origin', ...opts });
  if (res.status === 401){ location.href = '/admin/login.html'; throw new Error('unauthorized'); }
  return res;
}
async function apiJSON(path, opts={}){ const r = await api(path, opts); return r.json(); }

// redirect to login if no valid session (call at top of protected pages)
async function guard(){
  try{
    const r = await fetch('/api/admin/session', { credentials:'same-origin' });
    const { authed } = await r.json();
    if (!authed){ location.href = '/admin/login.html'; return false; }
    return true;
  }catch{ location.href = '/admin/login.html'; return false; }
}

async function logout(){
  await fetch('/api/admin/logout', { method:'POST', credentials:'same-origin' });
  location.href = '/admin/login.html';
}

function sidebar(active){
  const item = (href,label,key)=>`<a href="${href}" class="${key===active?'active':''}">${label}</a>`;
  return `<aside class="side">
    <div class="logo">UNIQLYours<span>Shop admin</span></div>
    ${item('/admin/index.html','Dashboard','home')}
    ${item('/admin/products.html','Products','products')}
    ${item('/admin/import.html','Import (Excel)','import')}
    ${item('/admin/orders.html','Orders','orders')}
    ${item('/admin/custom-requests.html','Custom requests','custom')}
    ${item('/admin/social.html','Instagram','social')}
    ${item('/admin/settings.html','Settings','settings')}
    <div class="spacer"></div>
    <a class="view-shop" href="/" target="_blank">View shop ↗</a>
    <button class="logout" onclick="logout()">Sign out</button>
  </aside>`;
}

let _toastTimer;
function toast(msg){
  let el = document.querySelector('.toast');
  if(!el){ el=document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer); _toastTimer = setTimeout(()=>el.classList.remove('show'), 2200);
}
