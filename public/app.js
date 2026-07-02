// ---------- decorative icons used when a product has no photo yet ----------
const ICONS = {
  bunny:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 30c-3-6-4-16-1-17s6 7 6 13M40 30c3-6 4-16 1-17s-6 7-6 13"/><circle cx="32" cy="42" r="13"/><circle cx="27" cy="40" r="1.6" fill="currentColor"/><circle cx="37" cy="40" r="1.6" fill="currentColor"/><path d="M32 44v3M29 48c1.5 1.5 4.5 1.5 6 0"/></svg>',
  blanket:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4 3 8 3 12 0s8-3 12 0 8 3 12 0M12 32c4 3 8 3 12 0s8-3 12 0 8 3 12 0M12 42c4 3 8 3 12 0s8-3 12 0 8 3 12 0"/></svg>',
  beanie:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 40a18 18 0 0 1 36 0z"/><path d="M10 40h44M24 40V28M32 40V26M40 40V28"/></svg>',
  tote:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 24h32l-3 28H19z"/><path d="M24 24v-4a8 8 0 0 1 16 0v4"/><path d="M22 32h20M22 40h20"/></svg>',
  booties:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 26v10c0 4 3 6 8 6h6V26z"/><path d="M28 36c4 0 8 2 10 5s5 3 8 1 2-6-2-8-8-3-10-6"/><path d="M14 30h14"/></svg>',
  daisy:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="6"/><path d="M32 26V14M32 38v12M26 32H14M38 32h12M27 27l-8-8M37 37l8 8M37 27l8-8M27 37l-8 8"/></svg>',
  scarf:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14c-6 8-6 20 0 28s6 6 0 12M44 14c6 8 6 20 0 28"/><path d="M44 54V42M40 54v-9M48 54v-9M20 22h24M20 32h24"/></svg>',
  octopus:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 30a10 10 0 0 1 20 0v6H22z"/><circle cx="28" cy="29" r="1.6" fill="currentColor"/><circle cx="36" cy="29" r="1.6" fill="currentColor"/><path d="M22 36c-3 2-6 2-8 6M28 38c-1 4-3 6-3 10M36 38c1 4 3 6 3 10M42 36c3 2 6 2 8 6"/></svg>',
  potholder:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="20" width="28" height="28" rx="5"/><path d="M44 26h5M16 30h28M16 38h28M30 20v28"/></svg>',
  yarn:'<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="16"/><path d="M20 28c6 3 18 3 24 0M19 36c8 3 18 3 26 0M26 17c-4 8-4 22 0 30M38 17c4 8 4 22 0 30"/></svg>'
};
function pickIcon(p){
  const s = ((p.kind||'') + ' ' + (p.name||'') + ' ' + (p.category||'')).toLowerCase();
  if (/bun|rabbit/.test(s)) return ICONS.bunny;
  if (/blanket|throw/.test(s)) return ICONS.blanket;
  if (/beanie|hat/.test(s)) return ICONS.beanie;
  if (/tote|bag|basket/.test(s)) return ICONS.tote;
  if (/booti|baby/.test(s)) return ICONS.booties;
  if (/coaster|daisy|flower/.test(s)) return ICONS.daisy;
  if (/scarf|cowl/.test(s)) return ICONS.scarf;
  if (/octo|plush|toy/.test(s)) return ICONS.octopus;
  if (/pot|holder|home/.test(s)) return ICONS.potholder;
  return ICONS.yarn;
}
const knit = c => `repeating-linear-gradient(45deg, ${c}55 0 6px, transparent 6px 12px), repeating-linear-gradient(-45deg, ${c}40 0 6px, transparent 6px 12px)`;
function thumbInner(p){
  if (p.photo) return `<img src="${p.photo}" alt="${esc(p.name)}">`;
  return pickIcon(p);
}
function thumbStyle(p){
  return p.photo ? '' : `background:${p.colorway}22;background-image:${knit(p.colorway)}`;
}

// ---------- state ----------
let PRODUCTS = [];
let cart = {};
// keep the basket across page loads (and the round-trip to Stripe)
try{ cart = JSON.parse(localStorage.getItem('uy_cart')||'{}') || {}; }catch{ cart = {}; }
function saveCart(){ try{ localStorage.setItem('uy_cart', JSON.stringify(cart)); }catch{} }
let view = 'cart';
let activeCat = 'All';
const $ = s => document.querySelector(s);
const money = n => '$' + Number(n).toFixed(2);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- load products ----------
async function loadProducts(){
  try{
    const r = await fetch('/api/products');
    PRODUCTS = await r.json();
  }catch{ PRODUCTS = []; }
  const dc = $('#designCount'); if(dc) dc.textContent = PRODUCTS.length || '0';
  renderFilters(); renderGrid();
}
function renderFilters(){
  const cats = ['All', ...new Set(PRODUCTS.map(p=>p.category).filter(Boolean))];
  $('#filters').innerHTML = cats.map(c=>`<button class="chip ${c===activeCat?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
function renderGrid(){
  if(!PRODUCTS.length){ $('#grid').innerHTML = `<p class="muted-empty">No products yet — add some from the <a href="/admin">admin page</a>.</p>`; return; }
  const list = activeCat==='All' ? PRODUCTS : PRODUCTS.filter(p=>p.category===activeCat);
  $('#grid').innerHTML = list.map(p=>`
    <article class="card">
      <div class="thumb" style="${thumbStyle(p)}">
        <span class="tag">${money(p.price)}</span>
        ${thumbInner(p)}
      </div>
      <div class="card-body">
        <span class="kind">${esc(p.kind||'Handmade')}</span>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description||'')}</p>
        <button class="add" data-add="${p.id}">Add to basket</button>
      </div>
    </article>`).join('');
}

// ---------- cart ----------
const findP = id => PRODUCTS.find(p=>p.id===id);
const count = () => Object.values(cart).reduce((a,b)=>a+b,0);
const subtotal = () => Object.entries(cart).reduce((s,[id,q])=>{const p=findP(id);return s+(p?p.price*q:0);},0);
function updateCount(){ $('#cartCount').textContent = count(); saveCart(); }
const shipFlat = () => Number(SETTINGS.shippingFlat) || 0;
function addToCart(id){
  cart[id]=(cart[id]||0)+1; updateCount();
  const b=document.querySelector(`[data-add="${id}"]`);
  if(b){b.textContent='Added ✓';b.style.background='var(--sage)';b.style.color='#fff';setTimeout(()=>{b.textContent='Add to basket';b.style.background='';b.style.color='';},1100);}
  openDrawer();
}
function setQty(id,d){ cart[id]+=d; if(cart[id]<=0) delete cart[id]; updateCount(); renderDrawer(); }
function removeItem(id){ delete cart[id]; updateCount(); renderDrawer(); }

// ---------- drawer ----------
function renderDrawer(){ if(view==='done') return renderDone(); if(view==='checkout') return renderCheckout(); renderCart(); }
function renderCart(){
  $('#drawerTitle').textContent='Your basket';
  const ids=Object.keys(cart);
  if(!ids.length){ $('#drawerBody').innerHTML=`<div class="empty"><div class="big">🧺</div><p>Your basket is empty.<br>Add something soft to begin.</p></div>`; $('#drawerFoot').innerHTML=''; return; }
  $('#drawerBody').innerHTML = ids.map(id=>{const p=findP(id),q=cart[id];return `
    <div class="line-item">
      <div class="li-thumb" style="${thumbStyle(p)}">${thumbInner(p)}</div>
      <div class="li-main"><h4>${esc(p.name)}</h4><div class="price">${money(p.price)} each</div>
        <div class="qty"><button data-q="${id}|-1" aria-label="Decrease">−</button><span>${q}</span><button data-q="${id}|1" aria-label="Increase">+</button></div>
        <button class="li-remove" data-rm="${id}">Remove</button>
      </div>
      <div style="font-family:var(--font-display);font-weight:700">${money(p.price*q)}</div>
    </div>`;}).join('');
  $('#drawerFoot').innerHTML = `<div class="subtotal"><span>Subtotal</span><span>${money(subtotal())}</span></div>
    <div class="ship-note">${shipFlat()>0 ? `Flat shipping ${money(shipFlat())} added at checkout.` : 'Free shipping!'}</div>
    <button class="checkout-btn" id="toCheckout">Checkout</button>`;
}
function renderCheckout(){
  $('#drawerTitle').textContent='Checkout';
  $('#drawerBody').innerHTML = `<div class="co-section">
    <button class="back-link" id="backToCart">← Back to basket</button>
    <h4>Contact</h4>
    <div class="field"><label>Full name</label><input id="f_name" placeholder="Jane Maker"></div>
    <div class="field"><label>Email</label><input id="f_email" type="email" placeholder="jane@email.com"></div>
    <h4>Ship to</h4>
    <div class="field"><label>Address</label><input id="f_addr" placeholder="123 Cozy Lane"></div>
    <div class="row2"><div class="field"><label>City</label><input id="f_city" placeholder="Baltimore"></div><div class="field"><label>State</label><input id="f_state" placeholder="MD"></div></div>
    <div class="field"><label>ZIP</label><input id="f_zip" placeholder="21201"></div>
  </div>`;
  const ship = shipFlat(), total = subtotal() + ship;
  $('#drawerFoot').innerHTML = `
    <div class="subtotal"><span>Subtotal</span><span>${money(subtotal())}</span></div>
    <div class="subtotal"><span>Shipping</span><span>${ship>0?money(ship):'Free'}</span></div>
    <div class="subtotal"><span><b>Total</b></span><span><b>${money(total)}</b></span></div>
    ${SETTINGS.cardPayments ? `<button class="checkout-btn" id="payCard">Pay ${money(total)} with card</button>
    <div class="ship-note" style="text-align:center;margin:6px 0 2px">Secure payment via Stripe — or</div>
    <button class="checkout-btn" id="placeOrder" style="background:var(--ink)">Order now, arrange payment later</button>`
    : `<button class="checkout-btn" id="placeOrder">Place order</button>
    <div class="ship-note">We'll email you to arrange payment.</div>`}`;
}
function renderDone(num){
  $('#drawerTitle').textContent='Thank you!';
  $('#drawerBody').innerHTML = `<div class="confirm"><div class="check">✓</div><h3>Order placed</h3>
    <p>We'll start hooking your pieces this week and email you when they ship.</p>
    <div class="num">Order ${esc(num||'')}</div></div>`;
  $('#drawerFoot').innerHTML = `<button class="checkout-btn" id="keepShopping" style="background:var(--ink)">Keep shopping</button>`;
  cart={}; updateCount();
}

function checkoutPayload(){
  const name=$('#f_name').value.trim(), email=$('#f_email').value.trim(), line1=$('#f_addr').value.trim();
  if(!name||!email||!line1){ alert('Please add your name, email and address to place the order.'); return null; }
  return {
    customer:{ name, email },
    address:{ line1, city:$('#f_city').value.trim(), state:$('#f_state').value.trim(), zip:$('#f_zip').value.trim() },
    items: Object.entries(cart).map(([id,qty])=>({id,qty}))
  };
}
async function placeOrder(){
  const payload = checkoutPayload(); if(!payload) return;
  const btn=$('#placeOrder'); btn.disabled=true; btn.textContent='Placing order…';
  try{
    const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||'Something went wrong');
    view='done'; renderDone(data.number);
  }catch(e){ alert(e.message); btn.disabled=false; btn.textContent='Order now, arrange payment later'; }
}
async function payWithCard(){
  const payload = checkoutPayload(); if(!payload) return;
  const btn=$('#payCard'); btn.disabled=true; btn.textContent='Taking you to secure payment…';
  try{
    const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||'Something went wrong');
    window.location.href = data.url; // Stripe-hosted checkout page
  }catch(e){ alert(e.message); btn.disabled=false; btn.textContent='Pay with card'; }
}
// returning from Stripe: ?session_id=... on success, ?canceled=1 if they backed out
async function handleStripeReturn(){
  const q = new URLSearchParams(location.search);
  if(q.get('session_id')){
    try{
      const r = await fetch('/api/checkout/confirm?session_id='+encodeURIComponent(q.get('session_id')));
      const data = await r.json();
      if(r.ok){ cart={}; updateCount(); view='done'; renderDone(data.number); $('#drawer').classList.add('open'); $('#overlay').classList.add('open'); }
      else alert(data.error||'We could not confirm the payment — please contact us.');
    }catch{ alert('We could not confirm the payment — please contact us.'); }
    history.replaceState(null,'',location.pathname);
  } else if(q.get('canceled')){
    openDrawer(); // basket is still saved
    history.replaceState(null,'',location.pathname);
  }
}

function openDrawer(){ view='cart'; renderDrawer(); $('#drawer').classList.add('open'); $('#overlay').classList.add('open'); }
function closeDrawer(){ $('#drawer').classList.remove('open'); $('#overlay').classList.remove('open'); }

document.addEventListener('click', e=>{
  const t=e.target;
  if(t.dataset.add) addToCart(t.dataset.add);
  const catEl = t.closest && t.closest('[data-cat]');
  if(catEl){ activeCat=catEl.dataset.cat; renderFilters(); renderGrid(); }
  if(t.dataset.q){ const [id,d]=t.dataset.q.split('|'); setQty(id,+d); }
  if(t.dataset.rm) removeItem(t.dataset.rm);
  if(t.id==='openCart') openDrawer();
  if(t.id==='closeCart'||t.id==='overlay') closeDrawer();
  if(t.id==='toCheckout'){ view='checkout'; renderDrawer(); }
  if(t.id==='backToCart'){ view='cart'; renderDrawer(); }
  if(t.id==='keepShopping'){ view='cart'; renderDrawer(); closeDrawer(); }
  if(t.id==='placeOrder') placeOrder();
  if(t.id==='payCard') payWithCard();
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });

// ---------- settings: instagram + custom orders ----------
let SETTINGS = {};
async function loadSettings(){
  try{ SETTINGS = await (await fetch('/api/settings')).json(); }
  catch{ SETTINGS = { customOrdersOpen:true, customOrdersNote:'', instagram:'', email:'' }; }
  applyInstagram();
  renderCustom();
}
function applyInstagram(){
  const ig = SETTINGS.instagram, nav = $('#igNav'), foot = $('#igFoot'), email = $('#emailFoot');
  if(ig){ [nav,foot].forEach(a=>{ if(a){ a.href = ig; a.hidden = false; } }); }
  if(SETTINGS.email && email){ email.href = 'mailto:' + SETTINGS.email; email.hidden = false; }
}
function renderCustom(){
  const card = $('#customCard'); if(!card) return;
  if(SETTINGS.customOrdersOpen){
    card.classList.remove('closed');
    card.innerHTML = `
      <div class="custom-intro">
        <div class="custom-status open"><span class="blip"></span> Taking custom orders</div>
        <h2>Want something made just for you?</h2>
        <p>${esc(SETTINGS.customOrdersNote||'')}</p>
      </div>
      <form class="custom-form" id="customForm">
        <div class="field"><label>Your name</label><input id="c_name" required></div>
        <div class="field"><label>Email</label><input id="c_email" type="email" required></div>
        <div class="field"><label>Budget (optional)</label><input id="c_budget" placeholder="e.g. $50–80"></div>
        <div class="field"><label>What would you love?</label><textarea id="c_message" placeholder="Colors, size, who it's for, any inspiration…" required></textarea></div>
        <button type="submit" class="btn-primary">Send request</button>
      </form>`;
    $('#customForm').addEventListener('submit', submitCustom);
  } else {
    card.classList.add('closed');
    card.innerHTML = `
      <div>
        <div class="custom-closed-icon">🧶</div>
        <div class="custom-status closed"><span class="blip"></span> Custom orders paused</div>
        <h2>Custom orders are closed for now</h2>
        <p style="color:var(--ink-soft);margin-top:12px">We've got our hands full at the moment, so we're not taking new custom requests just yet. The ready-made pieces above are available to order anytime — check back soon!</p>
      </div>`;
  }
}
async function submitCustom(e){
  e.preventDefault();
  const name=$('#c_name').value.trim(), email=$('#c_email').value.trim(), message=$('#c_message').value.trim(), budget=$('#c_budget').value.trim();
  if(!name||!email||!message){ alert('Please add your name, email and a short description.'); return; }
  const btn = e.target.querySelector('button'); btn.disabled=true; btn.textContent='Sending…';
  try{
    const r = await fetch('/api/custom-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,message,budget})});
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'Could not send your request.');
    card_thanks(name, email);
  }catch(err){ alert(err.message); btn.disabled=false; btn.textContent='Send request'; }
}
function card_thanks(name, email){
  const card = $('#customCard'); card.classList.add('closed');
  card.innerHTML = `<div class="custom-thanks"><div class="check">✓</div><h2>Request sent!</h2>
    <p style="color:var(--ink-soft);margin-top:10px">Thanks ${esc(name)} — we'll reply to ${esc(email)} with ideas and a quote soon.</p></div>`;
}

loadProducts(); loadSettings().then(handleStripeReturn); updateCount();
