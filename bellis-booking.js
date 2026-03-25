// bellis-booking.js
var BASE_PRICE = 260;
var blockedDates = new Set();
var checkIn = null, checkOut = null;
var viewYear = null, viewMonth = null;
var payMethod = 'card';

function parseIcal(text) {
  var b = new Set();
  var lines = text.replace(/\r\n /g,'').replace(/\r\n\t/g,'').split(/\r?\n/);
  var inEv=false, ds='', de='';
  for (var i=0; i<lines.length; i++) {
    var ln=lines[i];
    if (ln==='BEGIN:VEVENT') { inEv=true; ds=''; de=''; }
    if (!inEv) continue;
    if (ln.indexOf('DTSTART')===0) ds=ln.split(':').pop().trim().substring(0,8);
    if (ln.indexOf('DTEND')===0)   de=ln.split(':').pop().trim().substring(0,8);
    if (ln==='END:VEVENT' && ds && de) {
      var d=new Date(ds.substring(0,4)+'-'+ds.substring(4,6)+'-'+ds.substring(6,8)+'T00:00:00');
      var end=new Date(de.substring(0,4)+'-'+de.substring(4,6)+'-'+de.substring(6,8)+'T00:00:00');
      while(d<end){ b.add(d.toISOString().split('T')[0]); d.setDate(d.getDate()+1); }
      inEv=false;
    }
  }
  return b;
}

async function initCalendar() {
  var st=document.getElementById('cal-status');
  if (!st) return;
  st.textContent='Loading availability...'; st.className='cal-status loading';
  try {
    var r=await fetch('/.netlify/functions/ical?villa=bellis');
    if (!r.ok) throw new Error('HTTP '+r.status);
    blockedDates=parseIcal(await r.text());
    st.textContent='Availability loaded — select your check-in date';
    st.className='cal-status';
  } catch(e) {
    st.textContent='Could not load live availability — contact us to check dates';
    st.className='cal-status error';
  }
  renderCal();
}

function dStr(y,m,d) { return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }

function renderCal() {
  var today=new Date(); today.setHours(0,0,0,0);
  if (!viewYear) { viewYear=today.getFullYear(); viewMonth=today.getMonth(); }
  for (var s=0;s<2;s++) {
    var y=viewYear, m=viewMonth+s;
    if (m>11) { m-=12; y++; }
    renderMonth(y,m,s,today);
  }
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
  DOW.forEach(function(d){ h+='<div class="cal-dow">'+d+'</div>'; });
  for (var i=0;i<fd;i++) h+='<div class="cal-day cal-empty"></div>';
  for (var d=1;d<=dim;d++) {
    var ds=dStr(yr,mo,d), dt=new Date(ds+'T00:00:00');
    var c='cal-day';
    if (dt<today) c+=' cal-past';
    else if (blockedDates.has(ds)) c+=' cal-blocked';
    else if (checkIn&&checkOut&&ds>checkIn&&ds<checkOut) c+=' cal-in-range';
    if (ds===checkIn) c+=' cal-selected-in';
    if (ds===checkOut) c+=' cal-selected-out';
    if (ds===new Date().toISOString().split('T')[0]) c+=' cal-today';
    h+='<div class="'+c+'" data-date="'+ds+'" onclick="pickDay(this.dataset.date)">'+d+'</div>';
  }
  h+='</div>';
  el.innerHTML=h;
}

function shiftCal(dir) {
  viewMonth+=dir;
  if (viewMonth<0){ viewMonth=11; viewYear--; }
  if (viewMonth>11){ viewMonth=0; viewYear++; }
  renderCal();
}

function pickDay(ds) {
  var today=new Date(); today.setHours(0,0,0,0);
  if (new Date(ds+'T00:00:00')<today||blockedDates.has(ds)) return;
  if (!checkIn||(checkIn&&checkOut)){ checkIn=ds; checkOut=null; }
  else if (ds<=checkIn){ checkIn=ds; checkOut=null; }
  else {
    var d=new Date(checkIn+'T00:00:00'); d.setDate(d.getDate()+1);
    var end=new Date(ds+'T00:00:00'); var bad=false;
    while(d<end){ if(blockedDates.has(d.toISOString().split('T')[0])){ bad=true; break; } d.setDate(d.getDate()+1); }
    if(bad){ checkIn=ds; checkOut=null; } else checkOut=ds;
  }
  var fmt=function(s){ return new Date(s+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}); };
  var bar=document.getElementById('cal-bar');
  if(bar){ document.getElementById('cal-in-txt').textContent=checkIn?fmt(checkIn):'--'; document.getElementById('cal-out-txt').textContent=checkOut?fmt(checkOut):'--'; bar.style.display=checkIn?'block':'none'; }
  var st=document.getElementById('cal-status');
  if(st) st.textContent=checkIn&&checkOut?'Dates selected':checkIn?'Now select check-out date':'Select check-in date';
  renderCal();
  if(checkIn&&checkOut) calcBooking();
}

function calcBooking() {
  if(!checkIn||!checkOut) return;
  var nights=Math.round((new Date(checkOut)-new Date(checkIn))/86400000);
  if(nights<=0) return;
  var sub=nights*BASE_PRICE, disc=Math.round(sub*0.05), tot=sub-disc;
  document.getElementById('b-nights').textContent=nights+' night'+(nights>1?'s':'')+' x $'+BASE_PRICE;
  document.getElementById('b-sub').textContent='$'+sub;
  document.getElementById('b-disc').textContent='-$'+disc;
  document.getElementById('b-tot').textContent='$'+tot;
  document.getElementById('b-summary').style.display='block';
}

function switchBookTab(tab,el) {
  document.querySelectorAll('.booking-tab').forEach(function(t){ t.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('bp-direct').style.display=tab==='direct'?'block':'none';
  document.getElementById('bp-airbnb').style.display=tab==='airbnb'?'block':'none';
}

function pickPay(method,el) {
  payMethod=method;
  document.querySelectorAll('.pay-btn').forEach(function(b){ b.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('pf-card').style.display=method==='card'?'block':'none';
  document.getElementById('pf-paypal').style.display=method==='paypal'?'block':'none';
  document.getElementById('pf-bank').style.display=method==='bank'?'block':'none';
}

function fmtCard(el) {
  var v=el.value.replace(/\D/g,'').substring(0,16);
  el.value=v.replace(/(.{4})/g,'$1 ').trim();
}

function confirmBooking() {
  var name=document.getElementById('b-name').value.trim();
  var email=document.getElementById('b-email').value.trim();
  if(!name||!email||!checkIn||!checkOut){ alert('Please fill in your name, email and select travel dates.'); return; }
  var nights=Math.round((new Date(checkOut)-new Date(checkIn))/86400000);
  var tot=Math.round(nights*BASE_PRICE*0.95);
  var fmt=function(s){ return new Date(s+'T00:00:00').toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'}); };
  var pm={card:'Credit/Debit Card',paypal:'PayPal',bank:'Bank Transfer'};
  document.getElementById('b-conf-detail').innerHTML=
    '<b>Check-in:</b> '+fmt(checkIn)+'<br>'+
    '<b>Check-out:</b> '+fmt(checkOut)+'<br>'+
    '<b>Guests:</b> '+document.getElementById('b-guests').value+'<br>'+
    '<b>Total (5% off):</b> $'+tot+'<br>'+
    '<b>Payment:</b> '+pm[payMethod];
  document.getElementById('b-form').style.display='none';
  document.getElementById('b-confirm').style.display='block';
}

document.addEventListener('DOMContentLoaded', initCalendar);
