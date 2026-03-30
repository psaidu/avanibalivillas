// geya-booking.js

// ── CONFIG ──────────────────────────────────────────────────
var SEASONAL_PRICES = [
  { monthStart:1,  monthEnd:3,  price:220 },
  { monthStart:4,  monthEnd:6,  price:250 },
  { monthStart:7,  monthEnd:9,  price:280 },
  { monthStart:10, monthEnd:12, price:240 },
];
var EARLY_BIRD_DAYS  = 60;
var EARLY_BIRD_PCT   = 10;
var LAST_MINUTE_DAYS = 7;
var LAST_MINUTE_PCT  = 10;
var ADMIN_PASSWORD   = 'avani2025';
var STRIPE_PK        = 'pk_test_51TFi2zFppRXm3rjrcVAHi43tkKRiN0X5glzv0WnLhfJWWunaF2D7fZfggVh1PqJdFwdOY4D3lsu0F7lnWuNv2dx500MCIoe1ix';
var PAYPAL_CLIENT_ID = 'AcGCQOlVff2xZqnyNZt7RrpUav0sJ7teBbpx1hDV6D91dK99dJEZxNYvJPi4w3oSgOCMrD8kkcGQzp7I';

// ── STATE ────────────────────────────────────────────────────
var blockedDates      = new Set();
var directBookedDates = new Set();
var customPrices      = {};
var checkIn           = null;
var checkOut          = null;
var viewYear          = null;
var viewMonth         = null;
var payMethod         = 'card';
var adminMode         = false;
var paypalLoaded      = false;
var paypalButtonsRendered = false;
var stripeInstance    = null;
var stripeElements    = null;
var stripeCardElement = null;

// ── PRICING ──────────────────────────────────────────────────
function getSeasonalPrice(ds) {
  var m = parseInt(ds.split('-')[1], 10);
  for (var i=0; i<SEASONAL_PRICES.length; i++) {
    var s = SEASONAL_PRICES[i];
    if (m >= s.monthStart && m <= s.monthEnd) return s.price;
  }
  return 250;
}

function getFinalPrice(ds) {
  if (customPrices[ds]) return customPrices[ds];
  var base = getSeasonalPrice(ds);
  var today = new Date(); today.setHours(0,0,0,0);
  var daysUntil = Math.round((new Date(ds+'T00:00:00') - today) / 86400000);
  if (daysUntil >= EARLY_BIRD_DAYS) return Math.round(base * (1 - EARLY_BIRD_PCT/100));
  if (daysUntil <= LAST_MINUTE_DAYS && daysUntil >= 0) return Math.round(base * (1 - LAST_MINUTE_PCT/100));
  return base;
}

function getPriceLabel(ds) {
  if (customPrices[ds]) return '🔐 Admin Price: $' + customPrices[ds] + '/night';
  var base = getSeasonalPrice(ds);
  var today = new Date(); today.setHours(0,0,0,0);
  var daysUntil = Math.round((new Date(ds+'T00:00:00') - today) / 86400000);
  if (daysUntil >= EARLY_BIRD_DAYS) return '$'+base+' → $'+Math.round(base*(1-EARLY_BIRD_PCT/100))+'/night 🕊 Early Bird';
  if (daysUntil <= LAST_MINUTE_DAYS && daysUntil >= 0) return '$'+base+' → $'+Math.round(base*(1-LAST_MINUTE_PCT/100))+'/night ⚡ Last Minute';
  return '$'+base+'/night';
}

function getStayTotal(ciDs, coDs) {
  var d = new Date(ciDs+'T00:00:00'), end = new Date(coDs+'T00:00:00');
  var baseTotal=0, finalTotal=0, nights=0, earlyBirdNights=0, lastMinuteNights=0, adminNights=0;
  var today = new Date(); today.setHours(0,0,0,0);
  while (d < end) {
    var ds = d.toISOString().split('T')[0];
    var base = getSeasonalPrice(ds), final = getFinalPrice(ds);
    var daysUntil = Math.round((new Date(ds+'T00:00:00') - today) / 86400000);
    baseTotal += base; finalTotal += final; nights++;
    if (customPrices[ds]) adminNights++;
    else if (daysUntil >= EARLY_BIRD_DAYS) earlyBirdNights++;
    else if (daysUntil <= LAST_MINUTE_DAYS && daysUntil >= 0) lastMinuteNights++;
    d.setDate(d.getDate()+1);
  }
  return { nights, baseTotal, finalTotal, earlyBirdNights, lastMinuteNights, adminNights };
}

// ── ADMIN ────────────────────────────────────────────────────
function toggleAdminMode() {
  var deleteItem = document.getElementById('delete-legend-item');
  if (adminMode) {
    adminMode = false;
    document.getElementById('admin-btn').textContent = '🔐 Admin';
    document.getElementById('admin-btn').style.background = 'transparent';
    if (deleteItem) deleteItem.style.display = 'none';
    renderCal(); return;
  }
  var pw = prompt('Enter admin password:');
  if (pw === ADMIN_PASSWORD) {
    adminMode = true;
    document.getElementById('admin-btn').textContent = '✅ Admin ON';
    document.getElementById('admin-btn').style.background = 'rgba(184,98,62,0.15)';
    if (deleteItem) deleteItem.style.display = 'flex';
    alert('Admin mode ON — click available dates to set price, click booked dates to remove.');
    renderCal();
  } else if (pw !== null) { alert('Incorrect password.'); }
}

async function adminEditPrice(ds) {
  var current = customPrices[ds] || getFinalPrice(ds);
  var val = prompt('Set custom price for '+ds+' (current: $'+current+').\nLeave blank to reset to seasonal price:', current);
  if (val === null) return;
  var newPrice = val.trim() === '' ? null : parseInt(val, 10);
  if (val.trim() !== '' && (isNaN(newPrice) || newPrice < 1)) { alert('Invalid price.'); return; }
  try {
    var r = await fetch('/.netlify/functions/prices', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ villa:'geya', password:ADMIN_PASSWORD, date:ds, price:newPrice })
    });
    var data = await r.json();
    if (!r.ok) { alert('Error: '+(data.error||r.status)); return; }
    customPrices = data.prices || {};
    renderCal();
    if (checkIn && checkOut) calcBooking();
  } catch(e) { alert('Could not save: '+e.message); }
}

async function adminDeleteBooking(ds) {
  var confirmed = confirm('Remove direct booking covering '+ds+'?\nNote: Refund manually in Stripe if needed.');
  if (!confirmed) return;
  try {
    var r = await fetch('/.netlify/functions/geya-bookings');
    var text = await r.text();
    var lines = text.split('\n');
    var bookingId=null, inEvent=false, evStart='', evEnd='', evUid='';
    for (var i=0; i<lines.length; i++) {
      var ln = lines[i].trim();
      if (ln==='BEGIN:VEVENT') { inEvent=true; evStart=''; evEnd=''; evUid=''; }
      if (!inEvent) continue;
      if (ln.startsWith('DTSTART')) evStart=ln.split(':').pop().trim();
      if (ln.startsWith('DTEND'))   evEnd=ln.split(':').pop().trim();
      if (ln.startsWith('UID'))     evUid=ln.split(':').pop().trim().replace('@avanibalivillas.com','');
      if (ln==='END:VEVENT') {
        var dsClean=ds.replace(/-/g,'');
        if (dsClean>=evStart && dsClean<evEnd) bookingId=evUid;
        inEvent=false;
      }
    }
    if (!bookingId) { alert('Could not find booking ID.'); return; }
    var res = await fetch('/.netlify/functions/delete-booking', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ villa:'geya', password:ADMIN_PASSWORD, bookingId:bookingId })
    });
    var data = await res.json();
    if (!res.ok) { alert('Error: '+(data.error||res.status)); return; }
    alert('Booking removed. '+data.remaining+' booking(s) remaining.');
    await reloadCalendar();
  } catch(e) { alert('Error: '+e.message); }
}

// ── ICAL ─────────────────────────────────────────────────────
function parseIcal(text) {
  var b = new Set();
  var lines = text.replace(/\r\n /g,'').replace(/\r\n\t/g,'').split(/\r?\n/);
  var inEv=false, ds='', de='';
  for (var i=0; i<lines.length; i++) {
    var ln=lines[i];
    if (ln==='BEGIN:VEVENT'){inEv=true;ds='';de='';}
    if (!inEv) continue;
    if (ln.indexOf('DTSTART')===0) ds=ln.split(':').pop().trim().substring(0,8);
    if (ln.indexOf('DTEND')===0)   de=ln.split(':').pop().trim().substring(0,8);
    if (ln==='END:VEVENT'&&ds&&de) {
      var d=new Date(ds.substring(0,4)+'-'+ds.substring(4,6)+'-'+ds.substring(6,8)+'T00:00:00');
      var end=new Date(de.substring(0,4)+'-'+de.substring(4,6)+'-'+de.substring(6,8)+'T00:00:00');
      while(d<end){b.add(d.toISOString().split('T')[0]);d.setDate(d.getDate()+1);}
      inEv=false;
    }
  }
  return b;
}

async function reloadCalendar() {
  var st=document.getElementById('cal-status');
  if (st){st.textContent='Updating availability...';st.className='cal-status loading';}
  try {
    var results = await Promise.all([
      fetch('/.netlify/functions/ical?villa=geya&nocache='+Date.now()).then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
      fetch('/.netlify/functions/geya-bookings?nocache='+Date.now()).then(function(r){return r.ok?r.text():'';}).catch(function(){return'';})
    ]);
    var ab=parseIcal(results[0]), bb=parseIcal(results[1]);
    directBookedDates=bb;
    blockedDates=new Set([...ab,...bb]);
    if (st){st.textContent='Availability updated';st.className='cal-status';}
  } catch(e){}
  renderCal();
}

async function initCalendar() {
  var st=document.getElementById('cal-status');
  if (!st) return;
  st.textContent='Loading availability...'; st.className='cal-status loading';
  try {
    var results = await Promise.all([
      fetch('/.netlify/functions/ical?villa=geya').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
      fetch('/.netlify/functions/geya-bookings').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
      fetch('/.netlify/functions/prices?villa=geya').then(function(r){return r.ok?r.json():{};}).catch(function(){return{};})
    ]);
    var ab=parseIcal(results[0]), bb=parseIcal(results[1]);
    directBookedDates=bb;
    blockedDates=new Set([...ab,...bb]);
    customPrices=results[2]||{};
    st.textContent='Availability loaded — select your check-in date';
    st.className='cal-status';
  } catch(e) {
    st.textContent='Could not load live availability — contact us to check dates';
    st.className='cal-status error';
  }
  renderCal();
}

// ── CALENDAR ─────────────────────────────────────────────────
function dStr(y,m,d){return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');}

function renderCal() {
  var today=new Date(); today.setHours(0,0,0,0);
  if (!viewYear){viewYear=today.getFullYear();viewMonth=today.getMonth();}
  for (var s=0;s<2;s++){
    var y=viewYear,m=viewMonth+s;
    if(m>11){m-=12;y++;}
    renderMonth(y,m,s,today);
  }
  var ab=document.getElementById('admin-btn');
  if (ab) ab.style.display='inline-block';
}

function renderMonth(yr,mo,slot,today) {
  var el=document.getElementById('cal-m'+slot);
  if (!el) return;
  var MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DOW=['Su','Mo','Tu','We','Th','Fr','Sa'];
  var fd=new Date(yr,mo,1).getDay(), dim=new Date(yr,mo+1,0).getDate();
  var h='<div class="cal-nav">';
  h+=slot===0?'<button onclick="shiftCal(-1)">&#8249;</button>':'<div></div>';
  h+='<div class="cal-month-label">'+MN[mo]+' '+yr+'</div>';
  h+=slot===1?'<button onclick="shiftCal(1)">&#8250;</button>':'<div></div>';
  h+='</div><div class="cal-grid">';
  DOW.forEach(function(d){h+='<div class="cal-dow">'+d+'</div>';});
  for(var i=0;i<fd;i++) h+='<div class="cal-day cal-empty"></div>';
  for(var d=1;d<=dim;d++){
    var ds=dStr(yr,mo,d), dt=new Date(ds+'T00:00:00');
    var isPast=dt<today, isBlocked=blockedDates.has(ds), isAvail=!isPast&&!isBlocked;
    var isDirectBooked=directBookedDates.has(ds), hasCustom=!!customPrices[ds];
    var c='cal-day';
    if(isPast) c+=' cal-past';
    else if(isBlocked) c+=' cal-blocked';
    else if(checkIn&&checkOut&&ds>checkIn&&ds<checkOut) c+=' cal-in-range';
    if(ds===checkIn) c+=' cal-selected-in';
    if(ds===checkOut) c+=' cal-selected-out';
    if(ds===new Date().toISOString().split('T')[0]) c+=' cal-today';
    if(hasCustom) c+=' cal-custom-price';
    if(adminMode&&isAvail) c+=' cal-admin';
    var tooltip=isAvail?'<span class="cal-tooltip">'+getPriceLabel(ds)+'</span>':'';
    var onclick;
    if(adminMode&&isAvail) onclick='data-date="'+ds+'" onclick="adminEditPrice(this.dataset.date)"';
    else if(adminMode&&isDirectBooked) onclick='data-date="'+ds+'" onclick="adminDeleteBooking(this.dataset.date)" style="cursor:pointer;outline:2px dashed #c0392b;outline-offset:-1px;"';
    else onclick='data-date="'+ds+'" onclick="pickDay(this.dataset.date)"';
    h+='<div class="'+c+'" '+onclick+'>'+tooltip+d+'</div>';
  }
  h+='</div>';
  el.innerHTML=h;
}

function shiftCal(dir){
  viewMonth+=dir;
  if(viewMonth<0){viewMonth=11;viewYear--;}
  if(viewMonth>11){viewMonth=0;viewYear++;}
  renderCal();
}

function pickDay(ds){
  var today=new Date(); today.setHours(0,0,0,0);
  if(new Date(ds+'T00:00:00')<today||blockedDates.has(ds)) return;
  if(!checkIn||(checkIn&&checkOut)){checkIn=ds;checkOut=null;}
  else if(ds<=checkIn){checkIn=ds;checkOut=null;}
  else {
    var d=new Date(checkIn+'T00:00:00'); d.setDate(d.getDate()+1);
    var end=new Date(ds+'T00:00:00'); var bad=false;
    while(d<end){if(blockedDates.has(d.toISOString().split('T')[0])){bad=true;break;}d.setDate(d.getDate()+1);}
    if(bad){checkIn=ds;checkOut=null;}else checkOut=ds;
  }
  var fmt=function(s){return new Date(s+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});};
  var bar=document.getElementById('cal-bar');
  if(bar){document.getElementById('cal-in-txt').textContent=checkIn?fmt(checkIn):'--';document.getElementById('cal-out-txt').textContent=checkOut?fmt(checkOut):'--';bar.style.display=checkIn?'block':'none';}
  var st=document.getElementById('cal-status');
  if(st) st.textContent=checkIn&&checkOut?'Dates selected':checkIn?'Now select your check-out date':'Select your check-in date';
  renderCal();
  if(checkIn&&checkOut) calcBooking();
}

function calcBooking(){
  if(!checkIn||!checkOut) return;
  var r=getStayTotal(checkIn,checkOut);
  var directDisc=Math.round(r.finalTotal*0.05);
  var grandTotal=r.finalTotal-directDisc;
  var rows='';
  rows+='<div class="b-summary-row"><span>'+r.nights+' night'+(r.nights>1?'s':'')+' (base rate)</span><span>$'+r.baseTotal+'</span></div>';
  if(r.earlyBirdNights>0){var s=Math.round(r.baseTotal*(EARLY_BIRD_PCT/100)*(r.earlyBirdNights/r.nights));rows+='<div class="b-summary-row disc"><span>🕊 Early Bird ('+r.earlyBirdNights+' night'+(r.earlyBirdNights>1?'s':'')+', '+EARLY_BIRD_PCT+'% off)</span><span>-$'+s+'</span></div>';}
  if(r.lastMinuteNights>0){var s=Math.round(r.baseTotal*(LAST_MINUTE_PCT/100)*(r.lastMinuteNights/r.nights));rows+='<div class="b-summary-row disc"><span>⚡ Last Minute ('+r.lastMinuteNights+' night'+(r.lastMinuteNights>1?'s':'')+', '+LAST_MINUTE_PCT+'% off)</span><span>-$'+s+'</span></div>';}
  if(r.adminNights>0){rows+='<div class="b-summary-row disc"><span>🔐 Custom price ('+r.adminNights+' night'+(r.adminNights>1?'s':'')+')</span><span></span></div>';}
  if(r.baseTotal!==r.finalTotal){rows+='<div class="b-summary-row" style="border-top:1px solid var(--sand);padding-top:0.4rem;margin-top:0.2rem"><span>Subtotal after discounts</span><span>$'+r.finalTotal+'</span></div>';}
  rows+='<div class="b-summary-row disc"><span>5% direct booking discount</span><span>-$'+directDisc+'</span></div>';
  rows+='<div class="b-summary-row tot"><span>Total</span><span>$'+grandTotal+'</span></div>';
  document.getElementById('b-summary').innerHTML=rows;
  document.getElementById('b-summary').style.display='block';
  var btn=document.getElementById('b-submit-btn');
  if(btn) btn.textContent='Confirm & Pay $'+grandTotal;
}

// ── BOOKING FORM ─────────────────────────────────────────────
function switchBookTab(tab,el){
  document.querySelectorAll('.booking-tab').forEach(function(t){t.classList.remove('active');});
  el.classList.add('active');
  document.getElementById('bp-direct').style.display=tab==='direct'?'block':'none';
  document.getElementById('bp-airbnb').style.display=tab==='airbnb'?'block':'none';
}

// ── PAYPAL ───────────────────────────────────────────────────
function loadPayPalSDK(callback) {
  if (paypalLoaded) { callback(); return; }
  var s = document.createElement('script');
  s.src = 'https://www.paypal.com/sdk/js?client-id=' + PAYPAL_CLIENT_ID + '&currency=USD';
  s.onload = function() { paypalLoaded = true; callback(); };
  s.onerror = function() {
    var c = document.getElementById('paypal-button-container');
    if (c) c.innerHTML = '<p style="color:#c0392b;font-size:0.8rem;text-align:center;padding:0.5rem">Could not load PayPal. Please try again.</p>';
  };
  document.head.appendChild(s);
}

function renderPayPalButtons() {
  var container = document.getElementById('paypal-button-container');
  if (!container) return;
  if (paypalButtonsRendered) return;
  if (!checkIn || !checkOut) {
    container.innerHTML = '<p style="font-size:0.8rem;color:#aaa;text-align:center;padding:0.5rem">Please select dates first</p>';
    return;
  }
  var name  = document.getElementById('b-name').value.trim();
  var email = document.getElementById('b-email').value.trim();
  if (!name || !email) {
    container.innerHTML = '<p style="font-size:0.8rem;color:#aaa;text-align:center;padding:0.5rem">Please enter your name and email first</p>';
    return;
  }
  var r      = getStayTotal(checkIn, checkOut);
  var finalT = r.finalTotal - Math.round(r.finalTotal * 0.05);
  container.innerHTML = '';
  paypal.Buttons({
    style: { layout:'vertical', color:'gold', shape:'rect', label:'pay', height:45 },
    createOrder: async function() {
      var res = await fetch('/.netlify/functions/paypal-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:'create', amount:finalT, currency:'USD',
          villa: document.title.split('\u2014')[0].trim(),
          checkIn:checkIn, checkOut:checkOut,
          guestName:name, guestEmail:email, nights:r.nights,
        })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PayPal order creation failed');
      return data.orderID;
    },
    onApprove: async function(data) {
      container.innerHTML = '<p style="text-align:center;color:var(--gold);padding:1rem">Processing payment...</p>';
      var res = await fetch('/.netlify/functions/paypal-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action:'capture', orderID:data.orderID })
      });
      var result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Capture failed');
      var fmt = function(s) { return new Date(s+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'}); };
      showConfirmation(name, email, r, finalT, fmt, 'PayPal');
      setTimeout(function() { reloadCalendar(); }, 2000);
    },
    onError: function(err) {
      console.error('PayPal error:', err);
      container.innerHTML = '<p style="color:#c0392b;font-size:0.8rem;text-align:center;padding:0.5rem">PayPal error: ' + (err.message || JSON.stringify(err)) + '</p>';
      paypalButtonsRendered = false;
    },
    onCancel: function() {
      paypalButtonsRendered = false;
      renderPayPalButtons();
    }
  }).render('#paypal-button-container');
  paypalButtonsRendered = true;
}

function pickPay(method, el) {
  payMethod = method;
  document.querySelectorAll('.pay-btn').forEach(function(b) { b.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.getElementById('pf-card').style.display    = method==='card'   ?'block':'none';
  document.getElementById('pf-paypal').style.display  = method==='paypal' ?'block':'none';
  document.getElementById('pf-bank').style.display    = method==='bank'   ?'block':'none';
  if (method === 'paypal') {
    paypalButtonsRendered = false;
    loadPayPalSDK(function() { renderPayPalButtons(); });
  }
}

// ── STRIPE ───────────────────────────────────────────────────
function initStripe() {
  if (stripeInstance) return;
  if (typeof Stripe === 'undefined') {
    var s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = function() { stripeInstance = Stripe(STRIPE_PK); };
    document.head.appendChild(s);
  } else {
    stripeInstance = Stripe(STRIPE_PK);
  }
}

function mountStripeCard() {
  if (!stripeInstance) stripeInstance = Stripe(STRIPE_PK);
  var el = document.getElementById('stripe-card-element');
  if (!el || el.hasChildNodes()) return;
  stripeElements = stripeInstance.elements();
  stripeCardElement = stripeElements.create('card', {
    style: { base: { fontFamily:'Outfit,sans-serif', fontSize:'15px', color:'#18160f', '::placeholder':{color:'#aaa'} } }
  });
  stripeCardElement.mount('#stripe-card-element');
  stripeCardElement.on('change', function(e) {
    var err = document.getElementById('stripe-error');
    if (err) err.textContent = e.error ? e.error.message : '';
  });
}

async function confirmBooking() {
  var name  = document.getElementById('b-name').value.trim();
  var email = document.getElementById('b-email').value.trim();
  if (!name||!email||!checkIn||!checkOut) { alert('Please fill in your name, email and select travel dates.'); return; }
  var r      = getStayTotal(checkIn, checkOut);
  var finalT = r.finalTotal - Math.round(r.finalTotal * 0.05);
  var fmt    = function(s) { return new Date(s+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'}); };
  if (payMethod === 'card') {
    var btn = document.getElementById('b-submit-btn');
    if (btn) { btn.disabled=true; btn.textContent='Processing...'; }
    try {
      var res = await fetch('/.netlify/functions/stripe-payment', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ amount:finalT, currency:'usd', villa:document.title.split('\u2014')[0].trim(), checkIn:checkIn, checkOut:checkOut, guestName:name, guestEmail:email, nights:r.nights })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error||'Payment setup failed');
      var result = await stripeInstance.confirmCardPayment(data.clientSecret, {
        payment_method: { card:stripeCardElement, billing_details:{name:name,email:email} }
      });
      if (result.error) {
        var err = document.getElementById('stripe-error');
        if (err) err.textContent = result.error.message;
        if (btn) { btn.disabled=false; btn.textContent='Confirm & Pay $'+finalT; }
        return;
      }
      showConfirmation(name, email, r, finalT, fmt, 'Credit/Debit Card');
      setTimeout(function() { reloadCalendar(); }, 2000);
    } catch(e) {
      alert('Payment error: '+e.message);
      if (btn) { btn.disabled=false; btn.textContent='Confirm & Pay $'+finalT; }
    }
  } else if (payMethod === 'paypal') {
    // PayPal handled by PayPal buttons
    alert('Please use the PayPal button above to complete payment.');
  } else {
    showConfirmation(name, email, r, finalT, fmt, 'Bank Transfer');
  }
}

function showConfirmation(name, email, r, finalT, fmt, payLabel) {
  document.getElementById('b-conf-detail').innerHTML =
    '<b>Check-in:</b> '+fmt(checkIn)+'<br>'+
    '<b>Check-out:</b> '+fmt(checkOut)+'<br>'+
    '<b>Nights:</b> '+r.nights+'<br>'+
    '<b>Total (incl. all discounts):</b> $'+finalT+'<br>'+
    '<b>Payment:</b> '+payLabel;
  document.getElementById('b-form').style.display='none';
  document.getElementById('b-confirm').style.display='block';
}

function resetBookingForm() {
  document.getElementById('b-confirm').style.display='none';
  document.getElementById('b-form').style.display='block';
  checkIn=null; checkOut=null;
  var summary=document.getElementById('b-summary'); if(summary) summary.style.display='none';
  var btn=document.getElementById('b-submit-btn'); if(btn) btn.textContent='Confirm Booking Request';
  var bar=document.getElementById('cal-bar'); if(bar) bar.style.display='none';
  var name=document.getElementById('b-name'); if(name) name.value='';
  var email=document.getElementById('b-email'); if(email) email.value='';
  var phone=document.querySelector('input[type="tel"]'); if(phone) phone.value='';
  var guests=document.getElementById('b-guests'); if(guests) guests.selectedIndex=0;
  if (stripeCardElement) stripeCardElement.clear();
  var stripeError=document.getElementById('stripe-error'); if(stripeError) stripeError.textContent='';
  paypalButtonsRendered=false;
  var ppContainer=document.getElementById('paypal-button-container'); if(ppContainer) ppContainer.innerHTML='';
  pickPay('card', document.querySelector('.pay-btn'));
  renderCal();
}

document.addEventListener('DOMContentLoaded', function() {
  initCalendar();
  initStripe();
  // Hide delete legend item until admin mode is ON
  var items = document.querySelectorAll('.price-legend-item');
  items.forEach(function(el) {
    if (el.textContent.indexOf('Click booked') !== -1) {
      el.style.display='none'; el.id='delete-legend-item';
    }
  });
});
