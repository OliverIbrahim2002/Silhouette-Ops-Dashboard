#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

const SKIP_NAME = /^(total|hour|date|client|room|references|groupe|private|semi|flow|no melissa|melissa off|makeup|physio|extra hour|cadillac|waiting|stephanie chalhoub$|\d+$|^\d+\s*$)/i;
const SKIP_CONTAINS = /^(fill|rest |maybe |will confirm|didn|pvt$|sis$|friend |waiting list|for \d|check if)/i;

function mapHour(h) {
  const n = parseInt(String(h).trim(), 10);
  if (isNaN(n)) return null;
  if (n >= 8 && n <= 12) return n;
  if (n >= 1 && n <= 8) return n + 12;
  return null;
}

function cleanName(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\)\s*$/, '').replace(/^\(/, '');
  if (SKIP_NAME.test(s)) return null;
  if (SKIP_CONTAINS.test(s)) return null;
  if (/^\$?\d+(\.\d+)?$/.test(s)) return null;
  if (/total/i.test(s)) return null;
  if (/^NO MELISSA/i.test(s)) return null;
  if (/MELISSA OFF/i.test(s)) return null;
  if (/FLOW BIOMASS/i.test(s)) return null;
  // keep session counts like "Nelly Akra 5/8"
  return s;
}

function parseBookingCsv(text, tab) {
  const lines = text.split(/\r?\n/);
  const schedule = {};
  let dayNum = null;
  let inRoom1 = false;
  const rooms = tab === 'pilates' ? ['ROOM 1', 'ROOM 2'] : ['ROOM 1'];

  for (const line of lines) {
    const cols = line.split(',');
    const c0 = (cols[0] || '').trim();

    if (/^ROOM 1/i.test(c0)) {
      const dayMatch = cols[1] && cols[1].trim().match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
      if (dayMatch) inRoom1 = true;
    }
    if (/^Date$/i.test(c0)) {
      const d = parseInt(cols[1], 10);
      if (d >= 1 && d <= 31) dayNum = d;
    }
    if (!dayNum) continue;

    const hour = mapHour(c0);
    if (hour == null) continue;

    const dk = `2026-06-${String(dayNum).padStart(2, '0')}`;
    const key1 = `${tab}|${dk}|ROOM 1|${hour}`;
    if (!schedule[key1]) schedule[key1] = [];

    for (let i = 1; i <= 4; i++) {
      const nm = cleanName(cols[i]);
      if (nm && !schedule[key1].includes(nm)) schedule[key1].push(nm);
    }

    if (tab === 'pilates') {
      const key2 = `${tab}|${dk}|ROOM 2|${hour}`;
      if (!schedule[key2]) schedule[key2] = [];
      for (let i = 7; i <= 8; i++) {
        const nm = cleanName(cols[i]);
        if (nm && !schedule[key2].includes(nm)) schedule[key2].push(nm);
      }
    }
  }
  return schedule;
}

function mapAdsStage(status, notes) {
  const s = (status || '').toLowerCase();
  if (/membership/.test(s)) return 'membership';
  if (/canceled|cancelled/.test(s)) return 'trial_noshow';
  if (/postponed/.test(s)) return 'trial_booked';
  if (/hot lead/.test(s) && /show up/.test(s)) return 'follow_up_1';
  if (/hot lead/.test(s) && !/booked/.test(s)) return 'follow_up_1';
  if (/show up/.test(s) && /bad lead/.test(s)) return 'trial_done';
  if (/show up/.test(s) && /membership/.test(s)) return 'membership';
  if (/show up/.test(s)) return 'trial_show';
  if (/booked/.test(s)) return 'trial_booked';
  if (/hot lead/.test(s)) return 'follow_up_1';
  return 'trial_booked';
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseAdsCsv(text) {
  const lines = text.split(/\r?\n/);
  const leads = [];
  for (let i = 2; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = (cols[0] || '').trim();
    if (!name || /^lagree/i.test(name) || /^total/i.test(name)) continue;
    const phone = (cols[1] || '').trim();
    const status = (cols[2] || '').trim();
    let notes = '';
    for (let j = 3; j < cols.length; j++) {
      const cell = (cols[j] || '').trim();
      if (!cell) continue;
      if (/^Total |^Booked |^Show up |^Membership/i.test(cell)) break;
      notes += (notes ? ' | ' : '') + cell;
    }
    if (!status && !phone) continue;
    const mainName = name.replace(/\s*\+\s*friend.*$/i, '').replace(/\s*\+\s*.*/i, '').trim();
    if (!mainName || mainName.length < 2) continue;
    leads.push({
      name: mainName,
      phone,
      status,
      notes: notes.slice(0, 200),
      stage: mapAdsStage(status, notes),
      source: 'Ads',
      type: 'lagree',
      isFree: true,
      isNew: true,
    });
  }
  return leads;
}

// --- run ---
const adsPath = '/Users/oliver/Downloads/Ads Silhouette Studio - 2026 - Sheet1.csv';
const pilPath = '/Users/oliver/Downloads/Booking June 2026 Pilates - Week 1.csv';
const lagPath = '/Users/oliver/Downloads/Booking June 2026 Lagree - Week 1.csv';

const adsLeads = parseAdsCsv(fs.readFileSync(adsPath, 'utf8'));
const pilWeek1 = parseBookingCsv(fs.readFileSync(pilPath, 'utf8'), 'pilates');
const lagWeek1 = parseBookingCsv(fs.readFileSync(lagPath, 'utf8'), 'lagree');
const week1 = { ...pilWeek1, ...lagWeek1 };

console.log('Ads leads:', adsLeads.length);
console.log('Pilates slots:', Object.keys(pilWeek1).length);
console.log('Lagree slots:', Object.keys(lagWeek1).length);

// Read index.html and update SEED_SCHEDULE_JUNE2026 for week 1 dates only
let html = fs.readFileSync(INDEX, 'utf8');
const juneMatch = html.match(/var SEED_SCHEDULE_JUNE2026=(\{[\s\S]*?\});/);
if (!juneMatch) throw new Error('SEED_SCHEDULE_JUNE2026 not found');

const existing = JSON.parse(juneMatch[1]);
const week1Dates = new Set(['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-06']);
const merged = {};
for (const k in existing) {
  const dk = k.split('|')[1];
  if (!week1Dates.has(dk)) merged[k] = existing[k];
}
Object.assign(merged, week1);

const juneJson = JSON.stringify(merged);
html = html.replace(/var SEED_SCHEDULE_JUNE2026=\{[\s\S]*?\};/, `var SEED_SCHEDULE_JUNE2026=${juneJson};`);

// Add SEED_CRM_LAGREE_ADS if not exists, or replace
const crmJson = JSON.stringify(adsLeads);
if (/var SEED_CRM_LAGREE_ADS=/.test(html)) {
  html = html.replace(/var SEED_CRM_LAGREE_ADS=\[[\s\S]*?\];/, `var SEED_CRM_LAGREE_ADS=${crmJson};`);
} else {
  html = html.replace(
    /var SEED_SCHEDULE_JUNE2026=/,
    `var SEED_CRM_LAGREE_ADS=${crmJson};\nvar SEED_SCHEDULE_JUNE2026=`
  );
}

// Update CRM_STAGES
const newStages = `const CRM_STAGES=[
  {id:"new_lead",label:"New Lead",color:"var(--blue)",bg:"var(--blue-pl)"},
  {id:"contacted",label:"Contacted",color:"var(--purp)",bg:"var(--purp-pl)"},
  {id:"trial_booked",label:"Trial Booked",color:"var(--amb)",bg:"var(--amb-pl)"},
  {id:"trial_show",label:"Show",color:"var(--grn)",bg:"var(--grn-pl)"},
  {id:"trial_noshow",label:"No Show",color:"var(--red)",bg:"var(--red-pl)"},
  {id:"trial_done",label:"Trial Done",color:"var(--rose)",bg:"var(--rose-pl)"},
  {id:"follow_up_1",label:"Follow Up 1",color:"var(--blue)",bg:"var(--blue-pl)"},
  {id:"follow_up_2",label:"Follow Up 2",color:"var(--purp)",bg:"var(--purp-pl)"},
  {id:"follow_up_3",label:"Follow Up 3",color:"var(--amb-dk)",bg:"var(--amb-pl)"},
  {id:"membership",label:"Took Membership",color:"var(--grn)",bg:"var(--grn-pl)"},
  {id:"active",label:"Active Client",color:"var(--grn-dk)",bg:"var(--grn-pl)"},
  {id:"inactive",label:"Inactive",color:"var(--light)",bg:"var(--sand)"}
];`;

html = html.replace(/const CRM_STAGES=\[[\s\S]*?\];/, newStages);

// Update CRM_STAGE_RANK
html = html.replace(
  /const CRM_STAGE_RANK=\{[^}]+\};/,
  `const CRM_STAGE_RANK={new_lead:1,contacted:2,trial_booked:3,trial_show:4,trial_noshow:4,trial_done:5,follow_up_1:6,follow_up_2:7,follow_up_3:8,membership:9,active:10,inactive:11};`
);

// Update CRM_EARLY_STAGES
html = html.replace(
  /const CRM_EARLY_STAGES=\[[^\]]+\];/,
  `const CRM_EARLY_STAGES=['new_lead','contacted','trial_booked','trial_show','trial_noshow','trial_done','follow_up_1','follow_up_2','follow_up_3'];`
);

// Update syncFreeToTrialBooked later stages
html = html.replace(
  /const later=\['trial_done','membership','active','inactive'\];/,
  `const later=['trial_show','trial_noshow','trial_done','follow_up_1','follow_up_2','follow_up_3','membership','active','inactive'];`
);

// Expand AUTO_FREE_NEW_NAMES with all ads lead names
const allAdsNames = [...new Set(adsLeads.map(l => l.name))];
const existingAutoMatch = html.match(/const AUTO_FREE_NEW_NAMES=\[([\s\S]*?)\];/);
let existingNames = [];
if (existingAutoMatch) {
  try { existingNames = JSON.parse('[' + existingAutoMatch[1] + ']'); } catch (e) {}
}
const combinedNames = [...new Set([...existingNames, ...allAdsNames])].sort();
html = html.replace(
  /const AUTO_FREE_NEW_NAMES=\[[\s\S]*?\];/,
  `const AUTO_FREE_NEW_NAMES=${JSON.stringify(combinedNames)};`
);

// Add mergeLagreeAdsCrm function and call it in boot/refresh
if (!html.includes('function mergeLagreeAdsCrm')) {
  const mergeFn = `function mergeLagreeAdsCrm(){const seed=typeof SEED_CRM_LAGREE_ADS!=='undefined'?SEED_CRM_LAGREE_ADS:null;if(!seed||!seed.length)return 0;let added=0,pipeCh=false,dbCh=false;seed.forEach(lead=>{if(!lead.name)return;let c=findClient(lead.name);if(!c){c={id:Date.now()+Math.random(),name:lead.name,membership:'',completed:0,total:0,type:lead.type||'lagree',notes:lead.notes||'',source:lead.source||'Ads',phone:lead.phone||'',isFree:!!lead.isFree,isNew:!!lead.isNew,freeManualOff:false,paid:false};S.clientDB.push(c);added++;dbCh=true;}else{if(lead.notes&&!c.notes)c.notes=lead.notes;else if(lead.notes&&!c.notes.includes(lead.notes.slice(0,40)))c.notes=(c.notes?c.notes+' | ':'')+lead.notes;if(lead.phone&&!c.phone)c.phone=lead.phone;if(lead.source&&!c.source)c.source=lead.source;c.isFree=!!(c.isFree||lead.isFree);c.isNew=!!(c.isNew||lead.isNew);dbCh=true;}const stage=lead.stage||'trial_booked';const cur=S.pipeline[c.id];const rank=CRM_STAGE_RANK[stage]||0;const curRank=CRM_STAGE_RANK[cur]||0;if(!cur||rank>curRank){S.pipeline[c.id]=stage;if(!c.leadCreatedAt)setLeadCreated(c.id);pipeCh=true;}});if(dbCh)saveDB();if(pipeCh)savePipe();return added;}
function mergeLagreeAdsCrmOnce(){return mergeLagreeAdsCrm();}`;
  html = html.replace(
    /function mergeJuneSchedule\(\)\{mergeSeedSchedule/,
    mergeFn + '\nfunction mergeJuneSchedule(){mergeSeedSchedule'
  );
}

// Call mergeLagreeAdsCrmOnce in boot and refresh
if (!html.includes('mergeLagreeAdsCrmOnce()')) {
  html = html.replace(
    /mergeJuneSchedule\(\);const dupes=dedupeClientDB/,
    'mergeJuneSchedule();mergeLagreeAdsCrmOnce();const dupes=dedupeClientDB'
  );
  html = html.replace(
    /mergeJuneSchedule\(\);\n    const _dupesInit=dedupeClientDB/,
    'mergeJuneSchedule();mergeLagreeAdsCrmOnce();\n    const _dupesInit=dedupeClientDB'
  );
}

fs.writeFileSync(INDEX, html);
console.log('Updated index.html');
console.log('Stage breakdown:', adsLeads.reduce((a,l)=>{a[l.stage]=(a[l.stage]||0)+1;return a;},{}));
