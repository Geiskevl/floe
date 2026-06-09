// --- Service worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// --- Data ---
const STORAGE_KEY = 'floe_data';

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData(); }
  catch { return defaultData(); }
}
function defaultData() {
  return { periods: [], periodLength: 5, notifEnabled: false, notifDaysBefore: 2, moods: {} };
}
function saveData(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }

// --- Cycle logic ---
const PHASE_COLORS = { menstruation:'#E8517A', follicular:'#F4A261', ovulation:'#A8D5A2', luteal:'#9B8EC4' };
const PHASE_LABELS = { menstruation:'Menstruatie', follicular:'Folliculair', ovulation:'Ovulatie', luteal:'Luteaal' };
const PHASE_DESCRIPTIONS = {
  menstruation: 'Je menstruatie is begonnen. Neem de tijd voor jezelf en rust goed uit.',
  follicular:   'Je energie neemt toe. Het lichaam bereidt een eicel voor op de ovulatie.',
  ovulation:    'Je vruchtbaarste moment van de cyclus. Energie en stemming zijn vaak op hun hoogst.',
  luteal:       'Het lichaam bereidt zich voor op de volgende cyclus. Mogelijk wat meer vermoeidheid.',
};

function calcAvgCycleLength(periods) {
  if (periods.length < 2) return 28;
  const s = [...periods].sort((a,b) => new Date(a.date)-new Date(b.date));
  let t = 0;
  for (let i = 1; i < s.length; i++) t += (new Date(s[i].date)-new Date(s[i-1].date))/86400000;
  return Math.round(t/(s.length-1));
}
function calcCycleConsistency(periods) {
  if (periods.length < 3) return null;
  const s = [...periods].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const lens = [];
  for (let i=1;i<s.length;i++) lens.push((new Date(s[i].date)-new Date(s[i-1].date))/86400000);
  const avg = lens.reduce((a,b)=>a+b,0)/lens.length;
  const std = Math.sqrt(lens.reduce((sum,l)=>sum+Math.pow(l-avg,2),0)/lens.length);
  if (std<=2) return 'heel regelmatig';
  if (std<=5) return 'redelijk regelmatig';
  return 'wisselend';
}
function getPhaseForDay(day, cycleLength, periodLength) {
  const ov = cycleLength-14;
  if (day<=periodLength) return 'menstruation';
  if (day<=ov-1) return 'follicular';
  if (day<=ov+1) return 'ovulation';
  return 'luteal';
}
function getPhaseDayRanges(cycleLength, periodLength) {
  const ov = cycleLength-14;
  return { menstruation:[1,periodLength], follicular:[periodLength+1,ov-1], ovulation:[ov,ov+1], luteal:[ov+2,cycleLength] };
}
function getFertileWindow(cl) { const ov=cl-14; return {start:ov-5,end:ov+1,peak:[ov,ov+1]}; }
function getPmsWindow(cl) { return {start:cl-4,end:cl}; }
function getCurrentCycleDay(last) {
  const t=new Date(); t.setHours(0,0,0,0);
  const s=new Date(last.date); s.setHours(0,0,0,0);
  return Math.floor((t-s)/86400000)+1;
}
function getNextPeriodDate(last, cl) { const d=new Date(last.date); d.setDate(d.getDate()+cl); return d; }
function daysUntil(date) {
  const t=new Date(); t.setHours(0,0,0,0);
  const d=new Date(date); d.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
function formatDate(s) { return new Date(s).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'}); }
function formatDateShort(d) { return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'}); }
function addDays(date, n) { const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function isSameDay(a,b) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function todayKey() { return new Date().toISOString().split('T')[0]; }

// --- Check-in / mood ---
const MOOD_EMOJIS = { uitgeput:'🪫', moe:'😴', normaal:'😌', energiek:'⚡', prikkelbaar:'😤' };

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function shouldShowCheckin() {
  return !data.moods?.[todayKey()];
}

function showCheckin() {
  const screen = document.getElementById('checkinScreen');
  const app = document.getElementById('app');
  screen.classList.remove('hidden');
  app.classList.add('hidden');

  document.getElementById('checkinGreeting').textContent = getGreeting();

  // Show current phase hint if data exists
  const sorted = [...(data.periods||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const sub = document.getElementById('checkinPhaseSub');
  if (sorted.length > 0) {
    const cl = calcAvgCycleLength(data.periods);
    const pl = data.periodLength||5;
    const day = Math.min(getCurrentCycleDay(sorted[0]), cl);
    const phase = getPhaseForDay(day, cl, pl);
    sub.textContent = `Je bent op dag ${day} van je cyclus · ${PHASE_LABELS[phase]}`;
  } else {
    sub.textContent = '';
  }
}

function dismissCheckin(moodKey) {
  if (moodKey) {
    if (!data.moods) data.moods = {};
    data.moods[todayKey()] = moodKey;
    saveData(data);
    updateMoodBtn();
  }
  const screen = document.getElementById('checkinScreen');
  screen.classList.add('slide-out');
  screen.addEventListener('animationend', () => {
    screen.classList.add('hidden');
    screen.classList.remove('slide-out');
    document.getElementById('app').classList.remove('hidden');
  }, { once: true });
}

function updateMoodBtn() {
  const btn = document.getElementById('moodTodayBtn');
  const mood = data.moods?.[todayKey()];
  btn.textContent = mood ? MOOD_EMOJIS[mood] : '';
}

// Mood button clicks
document.querySelectorAll('.mood-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    setTimeout(() => dismissCheckin(btn.dataset.mood), 320);
  });
});
document.getElementById('checkinSkip').addEventListener('click', () => dismissCheckin(null));

// --- Canvas ring ---
function drawCycleRing(canvas, cycleDay, cycleLength, periodLength) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio||1, size = 220;
  canvas.width = size*dpr; canvas.height = size*dpr;
  canvas.style.width = size+'px'; canvas.style.height = size+'px';
  ctx.scale(dpr,dpr);
  const cx=size/2, cy=size/2, outerR=98, innerR=74, gap=0.018;
  const ranges = getPhaseDayRanges(cycleLength, periodLength);
  ctx.clearRect(0,0,size,size);
  function dayToAngle(d) { return (d/cycleLength)*Math.PI*2-Math.PI/2; }
  for (const phase of ['menstruation','follicular','ovulation','luteal']) {
    const [s,e] = ranges[phase];
    ctx.beginPath();
    ctx.arc(cx,cy,outerR,dayToAngle(s-1)+gap,dayToAngle(e)-gap);
    ctx.arc(cx,cy,innerR,dayToAngle(e)-gap,dayToAngle(s-1)+gap,true);
    ctx.closePath();
    ctx.fillStyle = PHASE_COLORS[phase];
    ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;
  }
  if (cycleDay!==null) {
    const phase = getPhaseForDay(cycleDay,cycleLength,periodLength);
    const [s,e] = ranges[phase];
    ctx.beginPath();
    ctx.arc(cx,cy,outerR,dayToAngle(s-1)+gap,dayToAngle(e)-gap);
    ctx.arc(cx,cy,innerR,dayToAngle(e)-gap,dayToAngle(s-1)+gap,true);
    ctx.closePath();
    ctx.fillStyle = PHASE_COLORS[phase]; ctx.globalAlpha=1; ctx.fill();
    const da=dayToAngle(cycleDay-0.5), dr=(outerR+innerR)/2;
    ctx.beginPath(); ctx.arc(cx+Math.cos(da)*dr,cy+Math.sin(da)*dr,7,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.fill();
    ctx.strokeStyle=PHASE_COLORS[phase]; ctx.lineWidth=2.5; ctx.stroke();
  }
}

// --- Calendar ---
function buildCalendar(lastPeriod, cycleLength, periodLength) {
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';
  if (!lastPeriod) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--color-text-secondary);font-size:14px;padding:16px 0">Log je eerste dag om de kalender te zien</div>';
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const fertile = getFertileWindow(cycleLength);
  const pms = getPmsWindow(cycleLength);
  ['Ma','Di','Wo','Do','Vr','Za','Zo'].forEach(d => {
    const h=document.createElement('div'); h.className='cal-day-header'; h.textContent=d; grid.appendChild(h);
  });
  const firstDow = (today.getDay()+6)%7;
  for (let i=0;i<firstDow;i++) { const b=document.createElement('div'); b.className='cal-day empty'; grid.appendChild(b); }
  let lastMonth = null;
  for (let i=0;i<=41;i++) {
    const date = addDays(today,i);
    const mk = date.getMonth();
    if (mk!==lastMonth && i>0) {
      lastMonth=mk;
      const lbl=document.createElement('div'); lbl.className='cal-month-label';
      lbl.textContent=date.toLocaleDateString('nl-NL',{month:'long',year:'numeric'});
      grid.appendChild(lbl);
      const dow=(date.getDay()+6)%7;
      for (let p=0;p<dow;p++) { const b=document.createElement('div'); b.className='cal-day empty'; grid.appendChild(b); }
    }
    const periodStart=new Date(lastPeriod.date); periodStart.setHours(0,0,0,0);
    let cd = Math.floor((date-periodStart)/86400000)+1;
    while (cd>cycleLength) cd-=cycleLength;
    while (cd<1) cd+=cycleLength;
    const phase=getPhaseForDay(cd,cycleLength,periodLength);
    const isFertile=cd>=fertile.start&&cd<=fertile.end;
    const isPeak=fertile.peak.includes(cd);
    const isPms=cd>=pms.start&&cd<=pms.end;
    const isToday=isSameDay(date,today);
    const cell=document.createElement('div'); cell.className='cal-day';
    if (isPms&&phase==='luteal') cell.classList.add('pms'); else cell.classList.add('phase-'+phase);
    if (isPeak) cell.classList.add('peak-fertile'); else if (isFertile) cell.classList.add('fertile');
    if (isToday) cell.classList.add('today');
    const num=document.createElement('span'); num.className='cal-day-num'; num.textContent=date.getDate(); cell.appendChild(num);
    cell.addEventListener('mouseenter',e=>showDayTooltip(e,date,phase,cd,isFertile,isPeak,isPms));
    cell.addEventListener('mouseleave',hideDayTooltip);
    cell.addEventListener('touchstart',e=>showDayTooltip(e.touches[0],date,phase,cd,isFertile,isPeak,isPms),{passive:true});
    cell.addEventListener('touchend',hideDayTooltip);
    grid.appendChild(cell);
  }
}

// --- Tooltip ---
const tooltip = document.getElementById('dayTooltip');
function showDayTooltip(e,date,phase,cycleDay,isFertile,isPeak,isPms) {
  const ds=date.toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'});
  let label=PHASE_LABELS[phase];
  if (isPeak) label='🌸 Piek vruchtbaarheid';
  else if (isFertile) label='🌿 Vruchtbaar venster';
  else if (isPms) label='🌧 PMS venster';
  tooltip.innerHTML=`<strong>${ds}</strong><br>Dag ${cycleDay} · ${label}`;
  tooltip.classList.add('visible');
  positionTooltip(e);
}
function hideDayTooltip() { tooltip.classList.remove('visible'); }
function positionTooltip(e) {
  const x=e.clientX,y=e.clientY,tw=tooltip.offsetWidth||160,th=tooltip.offsetHeight||50,vw=window.innerWidth,vh=window.innerHeight;
  let left=x-tw/2,top=y-th-12;
  if (left<8) left=8; if (left+tw>vw-8) left=vw-tw-8; if (top<8) top=y+20;
  tooltip.style.left=left+'px'; tooltip.style.top=top+'px';
}
document.addEventListener('mousemove',e=>{ if(tooltip.classList.contains('visible')) positionTooltip(e); });

// --- Notifications ---
async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission==='granted') return true;
  return (await Notification.requestPermission())==='granted';
}
function scheduleNotifCheck(d) {
  if (!d.notifEnabled||!('Notification' in window)||Notification.permission!=='granted') return;
  const sorted=[...d.periods].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if (!sorted.length) return;
  const cl=calcAvgCycleLength(d.periods);
  const notifDate=addDays(getNextPeriodDate(sorted[0],cl),-(d.notifDaysBefore||2));
  const ms=notifDate-new Date();
  if (ms>0&&ms<7*86400000) {
    setTimeout(()=>new Notification('Floe — periode eraan!',{body:`Je periode begint over ${d.notifDaysBefore} dag${d.notifDaysBefore>1?'en':''}. Zorg goed voor jezelf 💗`}),ms);
  }
}

// --- Render ---
let data = loadData();

function render() {
  const sorted=[...data.periods].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const cl=calcAvgCycleLength(data.periods);
  const pl=data.periodLength||5;
  const canvas=document.getElementById('cycleRing');

  if (sorted.length>0) {
    const last=sorted[0];
    const cd=getCurrentCycleDay(last), clamped=Math.min(cd,cl);
    const phase=getPhaseForDay(clamped,cl,pl);
    drawCycleRing(canvas,clamped,cl,pl);
    document.getElementById('cycleDayNumber').textContent=clamped;
    document.getElementById('phaseName').textContent=PHASE_LABELS[phase];
    document.getElementById('phaseDescription').textContent=PHASE_DESCRIPTIONS[phase];
    document.querySelectorAll('.legend-item').forEach(el=>el.classList.remove('active'));
    document.getElementById('legend-'+phase)?.classList.add('active');

    // Next period
    const nextDate=getNextPeriodDate(last,cl), dl=daysUntil(nextDate);
    document.getElementById('nextPeriodValue').textContent=formatDateShort(nextDate);
    document.getElementById('nextPeriodSub').textContent=dl===0?'vandaag verwacht':dl<0?`${Math.abs(dl)} d geleden`:`nog ${dl} dag${dl>1?'en':''}`;

    // Avg + consistency
    document.getElementById('avgCycleValue').textContent=cl+' d';
    document.getElementById('avgCycleSub').textContent=calcCycleConsistency(data.periods)||(data.periods.length>=2?'gemiddelde':'standaard');

    // Fertile
    const fertile=getFertileWindow(cl);
    const today=new Date(); today.setHours(0,0,0,0);
    let fsAdj=addDays(last.date,fertile.start-1), feAdj=addDays(last.date,fertile.end-1);
    if (clamped>fertile.end) { fsAdj=addDays(last.date,fertile.start-1+cl); feAdj=addDays(last.date,fertile.end-1+cl); }
    document.getElementById('fertilityValue').textContent=formatDateShort(fsAdj)+' – '+formatDateShort(feAdj);
    const dtf=daysUntil(fsAdj);
    document.getElementById('fertilitySub').textContent=dtf<=0&&daysUntil(feAdj)>=0?'nu vruchtbaar 🌸':dtf>0?`nog ${dtf} dag${dtf>1?'en':''}`:' volgende cyclus';

    // PMS
    const pms=getPmsWindow(cl);
    const psAdj=clamped>pms.end?addDays(last.date,pms.start-1+cl):addDays(last.date,pms.start-1);
    const dtp=daysUntil(psAdj);
    document.getElementById('pmsValue').textContent=formatDateShort(psAdj);
    document.getElementById('pmsSub').textContent=dtp<=0&&clamped<=cl?'PMS venster actief':dtp>0?`over ${dtp} dag${dtp>1?'en':''}`:' volgende cyclus';

    buildCalendar(last,cl,pl);
  } else {
    drawCycleRing(canvas,null,cl,pl);
    document.getElementById('cycleDayNumber').textContent='—';
    document.getElementById('phaseName').textContent='Geen data';
    document.getElementById('phaseDescription').textContent='Log je eerste menstruatiedag om te beginnen.';
    ['nextPeriodValue','fertilityValue','pmsValue'].forEach(id=>document.getElementById(id).textContent='—');
    ['nextPeriodSub','fertilitySub','pmsSub'].forEach(id=>document.getElementById(id).textContent='—');
    document.getElementById('avgCycleValue').textContent='28 d';
    document.getElementById('avgCycleSub').textContent='standaard';
    document.querySelectorAll('.legend-item').forEach(el=>el.classList.remove('active'));
    buildCalendar(null,cl,pl);
  }

  // Legend day ranges
  const ranges=getPhaseDayRanges(cl,pl);
  for (const [ph,[s,e]] of Object.entries(ranges)) {
    const el=document.getElementById('days-'+ph); if (el) el.textContent=`dag ${s}–${e}`;
  }

  // History
  const list=document.getElementById('historyList'); list.innerHTML='';
  if (sorted.length===0) { list.innerHTML='<li class="history-empty">Nog geen logs</li>'; }
  else sorted.forEach((p,i)=>{
    const li=document.createElement('li'); li.className='history-item';
    const cycLen=i<sorted.length-1?Math.round((new Date(p.date)-new Date(sorted[i+1].date))/86400000):null;
    li.innerHTML=`<span class="history-date">${formatDate(p.date)}</span><span class="history-meta">${cycLen!==null?`<span class="history-duration">${cycLen} d cyclus</span>`:''}<button class="history-delete" data-date="${p.date}" aria-label="Verwijder">×</button></span>`;
    list.appendChild(li);
  });
  list.querySelectorAll('.history-delete').forEach(btn=>btn.addEventListener('click',()=>{
    data.periods=data.periods.filter(p=>p.date!==btn.dataset.date); saveData(data); render();
  }));

  updateMoodBtn();
}

// --- Legend tooltips ---
document.querySelectorAll('.legend-item').forEach(item=>{
  item.addEventListener('click',()=>item.classList.toggle('expanded'));
});

// --- Modal helpers ---
function openModal(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow=''; }

// --- Log modal ---
document.getElementById('logBtn').addEventListener('click',()=>{
  document.getElementById('dateInput').value=new Date().toISOString().split('T')[0]; openModal('logModal');
});
document.getElementById('cancelBtn').addEventListener('click',()=>closeModal('logModal'));
document.getElementById('logModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal('logModal');});
document.getElementById('confirmBtn').addEventListener('click',()=>{
  const v=document.getElementById('dateInput').value; if (!v) return;
  if (!data.periods.find(p=>p.date===v)) { data.periods.push({date:v}); saveData(data); scheduleNotifCheck(data); }
  closeModal('logModal'); render();
});

// --- Settings modal ---
document.getElementById('settingsBtn').addEventListener('click',()=>{
  document.getElementById('periodLengthInput').value=data.periodLength||5;
  document.getElementById('notifToggle').checked=data.notifEnabled||false;
  document.getElementById('notifDaysInput').value=data.notifDaysBefore||2;
  document.getElementById('notifDaysRow').classList.toggle('visible',data.notifEnabled);
  openModal('settingsModal');
});
document.getElementById('settingsModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal('settingsModal');});
document.getElementById('notifToggle').addEventListener('change',async function(){
  document.getElementById('notifDaysRow').classList.toggle('visible',this.checked);
  if (this.checked&&!(await requestNotifPermission())) { this.checked=false; document.getElementById('notifDaysRow').classList.remove('visible'); }
});
document.getElementById('saveSettingsBtn').addEventListener('click',()=>{
  data.periodLength=parseInt(document.getElementById('periodLengthInput').value)||5;
  data.notifEnabled=document.getElementById('notifToggle').checked;
  data.notifDaysBefore=parseInt(document.getElementById('notifDaysInput').value)||2;
  saveData(data); scheduleNotifCheck(data); closeModal('settingsModal'); render();
});
document.getElementById('clearDataBtn').addEventListener('click',()=>{
  if (confirm('Weet je zeker dat je alle data wilt verwijderen?')) {
    data=defaultData(); saveData(data); closeModal('settingsModal'); render();
  }
});

// --- Mood today btn re-opens check-in ---
document.getElementById('moodTodayBtn').addEventListener('click',()=>{
  if (!data.moods) data.moods={};
  delete data.moods[todayKey()];
  saveData(data);
  showCheckin();
});

// --- Init ---
render();
if (shouldShowCheckin()) {
  showCheckin();
} else {
  document.getElementById('checkinScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}
