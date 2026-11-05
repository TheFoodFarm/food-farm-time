import { useState, useEffect, useRef } from "react";
import { db, auth, secondaryAuth } from "./firebase";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "firebase/auth";
import { collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, where } from "firebase/firestore";
import {
  Clock, MapPin, Coffee, LogIn, LogOut, Users, Download, Plus, X, AlertCircle, CheckCircle2,
  History, UserPlus, Calendar, ChevronLeft, ChevronRight, Edit2, Building2, Bell, Send, Check,
  Utensils, Briefcase, Truck, Package, Tractor, RefreshCw, Mail, Egg, BarChart2, Trash2,
  Activity, Smartphone, Lock, Copy, User, Settings
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════
const ADMIN_EMAIL = "info@thefoodfarm.com.au";
const MANAGER = ADMIN_EMAIL;
const APP_URL = "https://food-farm-time.vercel.app";
const SYD = "Australia/Sydney";
const TEAM_NAMES = ["Helena", "Arthur", "Blake", "Josi", "Jacob", "Jess", "Otis"];

const NFC_PARAM = (function () {
  try { return new URLSearchParams(window.location.search).get("nfc"); } catch (e) { return null; }
})();

const REMEMBER_KEY = "ff_last_login";
const readRemembered = () => {
  try { const v = JSON.parse(window.localStorage.getItem(REMEMBER_KEY) || "null"); return v && v.email ? v : null; } catch (e) { return null; }
};
const writeRemembered = (v) => {
  try { if (v) window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(v)); else window.localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* ignore */ }
};

const HOLIDAYS = {
  "2025-01-01": "New Year's Day", "2025-01-27": "Australia Day (obs.)",
  "2025-04-18": "Good Friday", "2025-04-19": "Easter Saturday", "2025-04-20": "Easter Sunday", "2025-04-21": "Easter Monday",
  "2025-04-25": "ANZAC Day", "2025-06-09": "King's Birthday", "2025-08-04": "Bank Holiday",
  "2025-10-06": "Labour Day", "2025-12-25": "Christmas Day", "2025-12-26": "Boxing Day",
  "2026-01-01": "New Year's Day", "2026-01-26": "Australia Day",
  "2026-04-03": "Good Friday", "2026-04-04": "Easter Saturday", "2026-04-05": "Easter Sunday", "2026-04-06": "Easter Monday",
  "2026-04-25": "ANZAC Day", "2026-06-08": "King's Birthday", "2026-08-03": "Bank Holiday",
  "2026-10-05": "Labour Day", "2026-12-25": "Christmas Day", "2026-12-26": "Boxing Day",
  "2026-12-28": "Boxing Day (additional)",
  "2027-01-01": "New Year's Day", "2027-01-26": "Australia Day",
  "2027-03-26": "Good Friday", "2027-03-27": "Easter Saturday", "2027-03-28": "Easter Sunday", "2027-03-29": "Easter Monday",
  "2027-04-25": "ANZAC Day", "2027-06-14": "King's Birthday", "2027-08-02": "Bank Holiday",
  "2027-10-04": "Labour Day", "2027-12-25": "Christmas Day", "2027-12-26": "Boxing Day",
  "2027-12-27": "Christmas Day (additional)", "2027-12-28": "Boxing Day (additional)"
};

const DEPTS = [
  { id: "office", label: "Office / Admin", Icon: Briefcase },
  { id: "butchery", label: "Butchery", Icon: Package },
  { id: "farm", label: "Farm", Icon: Tractor },
  { id: "markets", label: "Markets", Icon: Building2 },
  { id: "eggs", label: "Egg Cleaning & Packing", Icon: Egg },
  { id: "deliver", label: "Deliveries", Icon: Truck }
];
const deptLabel = (id) => { const d = DEPTS.find((x) => x.id === id); return d ? d.label : "—"; };

// ═════════════════════════════════════════════════════════════════════════════
// TIME HELPERS (everything is Sydney time)
// ═════════════════════════════════════════════════════════════════════════════
const SYD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: SYD, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});
const sydParts = (d) => { const o = {}; SYD_FMT.formatToParts(d).forEach((p) => { o[p.type] = p.value; }); return o; };
const sydKey = (iso) => { const p = sydParts(new Date(iso)); return p.year + "-" + p.month + "-" + p.day; };
const tzLabel = (d) => {
  try {
    const p = new Intl.DateTimeFormat("en-AU", { timeZone: SYD, timeZoneName: "short" }).formatToParts(d || new Date())
      .find((x) => x.type === "timeZoneName");
    return p ? p.value : "Sydney";
  } catch (e) { return "Sydney"; }
};
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-AU", { timeZone: SYD, hour: "numeric", minute: "2-digit" });
const fmtDateShort = (iso) => new Date(iso).toLocaleDateString("en-AU", { timeZone: SYD, weekday: "short", day: "numeric", month: "short" });
const fmtDur = (ms) => { if (!ms || ms < 0) ms = 0; return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m"; };
const fmtHrs = (ms) => (Math.max(0, ms || 0) / 3600000).toFixed(2);

// "YYYY-MM-DDTHH:mm" in Sydney wall-clock  <->  ISO (UTC)
const isoToSydInput = (iso) => {
  if (!iso) return "";
  const p = sydParts(new Date(iso));
  return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
};
const sydInputToISO = (str) => {
  if (!str) return null;
  const halves = str.split("T");
  const dp = halves[0].split("-").map(Number);
  const tp = (halves[1] || "00:00").split(":").map(Number);
  const target = Date.UTC(dp[0], dp[1] - 1, dp[2], tp[0], tp[1]);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = sydParts(new Date(guess));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess -= (wall - target);
  }
  return new Date(guess).toISOString();
};

// Calendar-date arithmetic on "YYYY-MM-DD" keys
const keyToDate = (k) => { const a = k.split("-").map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const dateToKey = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addDaysKey = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dateToKey(d); };
const mondayKey = (k) => { const d = keyToDate(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateToKey(d); };
const dowOfKey = (k) => keyToDate(k).getDay();
const fmtKey = (k) => keyToDate(k).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const weekLabel = (mk) => {
  const a = keyToDate(mk), b = keyToDate(addDaysKey(mk, 6));
  return a.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + " – " + b.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const firstDOW = (y, m) => new Date(y, m, 1).getDay();

// ═════════════════════════════════════════════════════════════════════════════
// BREAK + HOURS LOGIC
//   • Paid break allowance: 20 minutes in total per shift (rest + meal combined)
//   • Rest break: paid until the 20 min allowance is used, unpaid after that
//   • Meal break: the first 30 minutes are always unpaid; anything beyond that
//     can use whatever is left of the 20 min paid allowance
//   • Worked time = shift length − unpaid break time
// ═════════════════════════════════════════════════════════════════════════════
const PAID_CAP_MS = 20 * 60000;
const MEAL_UNPAID_MS = 30 * 60000;

const calcBreakSummary = (breaks) => {
  const list = [].concat(breaks || []).sort((a, b) => new Date(a.start) - new Date(b.start));
  let paidUsed = 0;
  return list.map((b) => {
    const endMs = b.end ? new Date(b.end).getTime() : Date.now();
    const ms = Math.max(0, endMs - new Date(b.start).getTime());
    let paidMs;
    if (b.type === "meal") {
      paidMs = Math.min(Math.max(0, ms - MEAL_UNPAID_MS), Math.max(0, PAID_CAP_MS - paidUsed));
    } else {
      paidMs = Math.min(ms, Math.max(0, PAID_CAP_MS - paidUsed));
    }
    paidUsed += paidMs;
    return Object.assign({}, b, { ms: ms, paidMs: paidMs, unpaidMs: ms - paidMs });
  });
};

const entryStats = (e) => {
  const end = e.clockOut ? new Date(e.clockOut).getTime() : Date.now();
  const total = Math.max(0, end - new Date(e.clockIn).getTime());
  const bs = calcBreakSummary(e.breaks);
  const breakMs = bs.reduce((a, b) => a + b.ms, 0);
  const paidMs = bs.reduce((a, b) => a + b.paidMs, 0);
  const unpaidMs = bs.reduce((a, b) => a + b.unpaidMs, 0);
  return { total: total, breakMs: breakMs, paidMs: paidMs, unpaidMs: unpaidMs, worked: Math.max(0, total - unpaidMs) };
};

// Turn "minutes" rows into real start/end times. Rows without a start time are
// placed one after another around the middle of the shift.
const placeBreaks = (rows, shiftStartISO, shiftEndISO) => {
  const s0 = new Date(shiftStartISO).getTime();
  const s1 = new Date(shiftEndISO).getTime();
  const valid = rows.filter((r) => Number(r.minutes) > 0);
  const total = valid.reduce((a, r) => a + Number(r.minutes) * 60000, 0);
  let cursor = Math.max(s0, (s0 + s1) / 2 - total / 2);
  return valid.map((r) => {
    let start, end;
    if (r.startInput) {
      start = new Date(sydInputToISO(r.startInput)).getTime();
      end = start + Number(r.minutes) * 60000;
    } else {
      start = cursor;
      end = cursor + Number(r.minutes) * 60000;
      cursor = end;
    }
    return { type: r.type || "rest", start: new Date(start).toISOString(), end: new Date(end).toISOString() };
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// MISC HELPERS
// ═════════════════════════════════════════════════════════════════════════════
const clean = (o) => JSON.parse(JSON.stringify(o));
const mailto = (to, subject, body) => {
  window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
};
const haversine = (la1, lo1, la2, lo2) => {
  const R = 6371000, r = (x) => x * Math.PI / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const genPassword = () => {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(10);
  window.crypto.getRandomValues(arr);
  let p = "";
  arr.forEach((n) => { p += chars[n % chars.length]; });
  return p + "!";
};
const downloadCSV = (filename, rows) => {
  const csv = rows.map((r) => r.map((c) => '"' + String(c === undefined || c === null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
const authMessage = (e) => {
  const c = e && e.code ? e.code : "";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-login-credentials") return "Email or password is incorrect.";
  if (c === "auth/invalid-email") return "That email address doesn't look right.";
  if (c === "auth/too-many-requests") return "Too many attempts. Please wait a few minutes and try again.";
  if (c === "auth/email-already-in-use") return "That email already has an account.";
  if (c === "auth/weak-password") return "Password must be at least 6 characters.";
  if (c === "auth/network-request-failed") return "No connection. Check your internet and try again.";
  if (c === "auth/requires-recent-login") return "Please sign out and back in, then try again.";
  return (e && e.message) ? e.message : "Something went wrong.";
};

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f5f5f6;--surface:#ffffff;--line:#e8e8ec;--ink:#18181b;--ink2:#52525b;--ink3:#9a9aa5;
  --red:#8b1a2b;--redh:#a52337;--redd:#6b1220;--redbg:#fbeef0;--redline:#f1d5da;
  --green:#17794a;--greenbg:#e7f5ee;--amber:#a8630a;--amberbg:#fdf3e1;--blue:#1d4f9c;--bluebg:#e8f0fb;
  --r:12px;--rs:8px;
  --sh:0 1px 2px rgba(16,16,20,.05),0 1px 3px rgba(16,16,20,.04);
  --shl:0 12px 40px rgba(16,16,20,.2);
  --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
}
body{font-family:var(--sans);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
input,select,textarea,button{font-family:inherit;font-size:inherit}
.mono{font-variant-numeric:tabular-nums}
.muted{color:var(--ink2)}
.strong{font-weight:600}
.small{font-size:12px}

.app{display:flex;min-height:100vh}
.sidebar{width:232px;flex-shrink:0;background:var(--redd);color:#fff;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto}
.sb-logo{padding:22px 20px 18px;display:flex;align-items:center;gap:12px}
.logo-badge{display:inline-flex;align-items:center;justify-content:center;background:#fff;border-radius:14px;padding:6px;flex-shrink:0}
.logo-badge img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.login-logo{margin-bottom:16px}
.tb-logo{display:none}
.sb-title{font-size:17px;font-weight:700;letter-spacing:-.01em}
.sb-sub{font-size:12px;color:rgba(255,255,255,.55);margin-top:2px}
.sb-nav{flex:1;padding:6px 10px}
.sb-sec{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.4);padding:16px 10px 6px}
.nav-btn{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--rs);font-size:14px;font-weight:500;color:rgba(255,255,255,.72);cursor:pointer;border:none;background:none;width:100%;text-align:left;transition:background .12s,color .12s}
.nav-btn:hover{background:rgba(255,255,255,.08);color:#fff}
.nav-btn.active{background:rgba(255,255,255,.16);color:#fff}
.sb-foot{padding:14px 16px;border-top:1px solid rgba(255,255,255,.12)}
.sb-user{font-size:13px;font-weight:600}
.sb-role{font-size:11px;color:rgba(255,255,255,.55);margin-bottom:10px}
.sb-out{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:var(--rs);padding:8px 10px;font-size:13px;cursor:pointer;width:100%}
.sb-out:hover{background:rgba(255,255,255,.18)}

.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{background:var(--surface);border-bottom:1px solid var(--line);padding:0 28px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.tb-t{font-size:18px;font-weight:600;letter-spacing:-.01em}
.tb-c{font-size:13px;color:var(--ink2);font-variant-numeric:tabular-nums}
.page{padding:24px 28px;max-width:1180px;width:100%}

.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh)}
.card-h{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.card-b{padding:18px}
.card-t{font-size:15px;font-weight:600}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.row{display:flex;align-items:center}
.col{display:flex;flex-direction:column}
.gap4{gap:4px}.gap8{gap:8px}.gap12{gap:12px}.gap16{gap:16px}
.between{justify-content:space-between}
.wrap{flex-wrap:wrap}
.mb12{margin-bottom:12px}.mb16{margin-bottom:16px}.mb20{margin-bottom:20px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 15px;border-radius:var(--rs);font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;transition:background .12s,border-color .12s;white-space:nowrap}
.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.btn-p{background:var(--red);color:#fff}.btn-p:hover{background:var(--redh)}
.btn-d{background:var(--redd);color:#fff}.btn-d:hover{background:var(--red)}
.btn-o{background:#fff;color:var(--ink);border-color:var(--line)}.btn-o:hover{border-color:var(--ink3);background:#fafafa}
.btn-g{background:transparent;color:var(--ink2)}.btn-g:hover{background:var(--bg)}
.btn-amber{background:var(--amberbg);color:var(--amber);border-color:#f0dcb4}.btn-amber:hover{background:#faebc8}
.btn-blue{background:var(--blue);color:#fff}.btn-blue:hover{background:#25609f}
.btn-sm{padding:6px 10px;font-size:12px}
.btn-lg{padding:15px 20px;font-size:15px;width:100%}

.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:100px;font-size:11px;font-weight:600;white-space:nowrap}
.b-green{background:var(--greenbg);color:var(--green)}
.b-red{background:var(--redbg);color:var(--red)}
.b-amber{background:var(--amberbg);color:var(--amber)}
.b-blue{background:var(--bluebg);color:var(--blue)}
.b-gray{background:#efeff1;color:var(--ink2)}

.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;box-shadow:var(--sh)}
.kpi-val{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.kpi-val small{font-size:13px;font-weight:500;color:var(--ink2);margin-left:3px}
.kpi-lbl{font-size:12px;color:var(--ink2);margin-top:6px}
.kpi.red .kpi-val{color:var(--red)}

.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3);border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#fafafb}
tr.totalrow td{background:#fafafb;font-weight:600}

.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cal-dh{font-size:11px;font-weight:600;text-align:center;color:var(--ink3);padding:5px 0}
.cal-day{min-height:70px;border:1px solid var(--line);border-radius:var(--rs);padding:5px;background:var(--surface)}
.cal-day.today{border-color:var(--red);background:var(--redbg)}
.cal-day.hol{background:#fdf6f0;border-color:#f0d9c4}
.cal-day.empty{background:transparent;border:none}
.cal-num{font-weight:600;font-size:12px}
.cal-chip{font-size:9px;margin-top:2px;line-height:1.3;border-radius:4px;padding:1px 4px}

.overlay{position:fixed;inset:0;background:rgba(24,24,27,.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
.modal{background:var(--surface);border-radius:var(--r);box-shadow:var(--shl);width:100%;max-width:480px;max-height:92vh;overflow-y:auto}
.modal.wide{max-width:640px}
.modal-h{padding:18px 22px 14px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.modal-t{font-size:17px;font-weight:600}
.modal-b{padding:18px 22px}
.modal-f{padding:14px 22px;border-top:1px solid var(--line);display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}

.fg{margin-bottom:14px}
.flbl{font-size:12px;font-weight:500;margin-bottom:5px;display:block;color:var(--ink2)}
.finp{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:var(--rs);font-size:14px;background:#fff;color:var(--ink);outline:none;transition:border-color .12s,box-shadow .12s}
.finp:focus{border-color:var(--red);box-shadow:0 0 0 3px var(--redbg)}
select.finp{appearance:auto}

.dept-list{list-style:none}
.dept-list li{padding:14px 20px;border-bottom:1px solid var(--line);cursor:pointer;display:flex;align-items:center;gap:12px;font-size:15px;font-weight:500}
.dept-list li:hover{background:var(--redbg);color:var(--red)}
.dept-list li:last-child{border-bottom:none}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:999;padding:11px 18px;border-radius:var(--rs);display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;box-shadow:var(--shl);animation:tup .2s ease-out;max-width:92vw}
.toast-ok{background:var(--ink);color:#fff}
.toast-err{background:var(--red);color:#fff}
.toast-warn{background:var(--amber);color:#fff}
@keyframes tup{from{transform:translateX(-50%) translateY(10px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}

.filter-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.seg{display:inline-flex;background:#fff;border:1px solid var(--line);border-radius:var(--rs);overflow:hidden}
.seg button{border:none;background:none;padding:8px 12px;cursor:pointer;color:var(--ink2);display:flex;align-items:center}
.seg button:hover{background:var(--bg)}
.seg .lbl{padding:8px 14px;font-size:13px;font-weight:600;border-left:1px solid var(--line);border-right:1px solid var(--line);white-space:nowrap}

.stat-row{display:flex;align-items:center;gap:12px;padding:9px 0}
.stat-label{font-size:13px;font-weight:500;min-width:150px;display:flex;align-items:center;gap:8px}
.stat-bar-bg{background:#efeff1;border-radius:100px;overflow:hidden;height:8px;flex:1}
.stat-bar-fill{height:100%;border-radius:100px;background:var(--red)}
.stat-val{font-size:12px;color:var(--ink2);min-width:54px;text-align:right;font-variant-numeric:tabular-nums}

.pill-row{display:flex;gap:8px;flex-wrap:wrap}
.pill{background:#f6f6f7;border:1px solid var(--line);border-radius:var(--rs);padding:6px 11px;font-size:12px;color:var(--ink2)}
.pill b{color:var(--ink);font-weight:600;margin-left:4px}

.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg)}
.login-card{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shl);width:100%;max-width:400px;overflow:hidden}
.login-top{background:var(--redd);color:#fff;padding:28px 28px 24px}
.login-top h1{font-size:22px;font-weight:700;letter-spacing:-.02em}
.login-top p{font-size:13px;color:rgba(255,255,255,.65);margin-top:4px}
.login-body{padding:26px 28px 28px}
.link-btn{background:none;border:none;color:var(--red);font-size:13px;font-weight:500;cursor:pointer;padding:0}
.link-btn:hover{text-decoration:underline}
.msg-err{background:var(--redbg);color:var(--red);border-radius:var(--rs);padding:10px 12px;font-size:13px;margin-bottom:14px}
.msg-ok{background:var(--greenbg);color:var(--green);border-radius:var(--rs);padding:10px 12px;font-size:13px;margin-bottom:14px}

.status-hero{border-radius:var(--r);padding:20px;margin-bottom:16px}
.status-hero.off{background:#f6f6f7}
.status-hero.on{background:var(--greenbg)}
.status-hero.brk{background:var(--amberbg)}
.status-hero .big{font-size:22px;font-weight:700;letter-spacing:-.02em}
.break-list{list-style:none}
.break-list li{padding:11px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px}
.break-list li:last-child{border-bottom:none}
.url-box{font-size:12px;background:#f6f6f7;border:1px solid var(--line);border-radius:var(--rs);padding:8px 10px;word-break:break-all}

.bottom-nav{display:none}
@media (max-width:768px){
  .sidebar{display:none}
  .bottom-nav{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:var(--redd);height:62px;padding-bottom:env(safe-area-inset-bottom)}
  .bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:none;background:none;color:rgba(255,255,255,.6);font-size:10px;font-weight:500;cursor:pointer;padding:6px 2px}
  .bnav-btn.active{color:#fff}
  .bnav-btn.active svg{stroke-width:2.6}
  .page{padding:16px 14px 88px}
  .g2{grid-template-columns:1fr}
  .g3{grid-template-columns:1fr 1fr}
  .kpi-grid{grid-template-columns:1fr 1fr}
  .topbar{padding:0 16px;height:54px}
  .tb-logo{display:inline-flex;margin-right:10px}
  .tb-left{display:flex;align-items:center}
  .tb-t{font-size:16px}
  .stat-label{min-width:100px;font-size:12px}
  th,td{padding:9px 10px}
  .login-top{padding:24px}
  .login-body{padding:22px}
}
`;

// ═════════════════════════════════════════════════════════════════════════════
// LOGO  (put your logo at  public/logo.png  — nothing shows if the file is missing)
// ═════════════════════════════════════════════════════════════════════════════
function Logo({ size }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <span className="logo-badge" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="The Food Farm" onError={() => setOk(false)} />
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// APP
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── auth / profile ────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState("loading");
  const [remembered, setRemembered] = useState(() => readRemembered());
  const [lgEmail, setLgEmail] = useState(() => { const r = readRemembered(); return r ? r.email : ""; });
  const [lgPass, setLgPass] = useState("");
  const [lgErr, setLgErr] = useState("");
  const [lgInfo, setLgInfo] = useState("");
  const [lgBusy, setLgBusy] = useState(false);

  // ── data ──────────────────────────────────────────────────────────────────
  const [staffAll, setStaffAll] = useState([]);
  const [entries, setEntries] = useState([]);
  const [roster, setRoster] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [farmLoc, setFarmLoc] = useState(null);
  const [entriesReady, setEntriesReady] = useState(false);

  // ── ui ────────────────────────────────────────────────────────────────────
  const [view, setView] = useState("clock");
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [calMo, setCalMo] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [openWk, setOpenWk] = useState({});
  const busyRef = useRef(false);

  // clock flow
  const [showDepts, setShowDepts] = useState(false);
  const [showRetro, setShowRetro] = useState(false);
  const [retroRows, setRetroRows] = useState([]);
  const [nfcPending, setNfcPending] = useState(NFC_PARAM);

  // timesheet / editing
  const [tsPerson, setTsPerson] = useState("all");
  const [editingEntry, setEditingEntry] = useState(null);
  const [eeIn, setEeIn] = useState("");
  const [eeOut, setEeOut] = useState("");
  const [eeNote, setEeNote] = useState("");
  const [breakEdit, setBreakEdit] = useState(null); // { entry, rows }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // reports
  const [rptWeek, setRptWeek] = useState(() => mondayKey(sydKey(new Date().toISOString())));
  const [rptPerson, setRptPerson] = useState("all");

  // staff admin
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [nsName, setNsName] = useState("");
  const [nsEmail, setNsEmail] = useState("");
  const [nsPass, setNsPass] = useState("");
  const [nsRole, setNsRole] = useState("staff");
  const [nsBusy, setNsBusy] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [credList, setCredList] = useState(null);
  const [editStaff, setEditStaff] = useState(null);
  const [esName, setEsName] = useState("");

  // roster / leave
  const [showAddRoster, setShowAddRoster] = useState(false);
  const [frStaff, setFrStaff] = useState("");
  const [frDate, setFrDate] = useState("");
  const [frStart, setFrStart] = useState("");
  const [frEnd, setFrEnd] = useState("");
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [flFrom, setFlFrom] = useState("");
  const [flTo, setFlTo] = useState("");
  const [flType, setFlType] = useState("annual");
  const [flNote, setFlNote] = useState("");

  // account
  const [showPw, setShowPw] = useState(false);
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const isAdmin = !!profile && profile.role === "admin";
  const everyone = staffAll.filter((s) => s.email).sort((a, b) => a.name.localeCompare(b.name));
  const team = everyone.filter((s) => s.role === "staff");
  const activeTeam = team.filter((s) => s.active !== false);
  const todayKey = sydKey(now.toISOString());

  const showToast = (msg, type) => {
    setToast({ msg: msg, type: type || "ok" });
    setTimeout(() => setToast(null), 3800);
  };

  // ── live clock ────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u || null));
    return () => unsub();
  }, []);

  // ── load (or create, for the admin email) the signed-in user's profile ────
  useEffect(() => {
    if (authUser === undefined) return;
    if (authUser === null) { setProfile(null); setProfileState("signedout"); return; }
    let cancelled = false;
    (async () => {
      setProfileState("loading");
      try {
        const ref = doc(db, "staff", authUser.uid);
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (snap.exists()) {
          const p = Object.assign({}, snap.data(), { id: snap.id });
          if (p.active === false) { setProfile(null); setProfileState("inactive"); }
          else { setProfile(p); setProfileState("ready"); }
        } else if ((authUser.email || "").toLowerCase() === ADMIN_EMAIL) {
          const p = { id: authUser.uid, name: "Hannah", email: ADMIN_EMAIL, role: "admin", active: true, createdAt: new Date().toISOString() };
          await setDoc(ref, p);
          if (!cancelled) { setProfile(p); setProfileState("ready"); }
        } else {
          setProfile(null);
          setProfileState("missing");
        }
      } catch (e) {
        console.error("profile load", e);
        if (!cancelled) setProfileState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  // ── default landing page per role ─────────────────────────────────────────
  useEffect(() => {
    if (profile) setView(profile.role === "admin" ? "live" : "clock");
  }, [profile && profile.id]);

  // ── remember who used this phone, so next time only the password is needed ─
  useEffect(() => {
    if (profile && profile.email) {
      const r = { email: profile.email, name: profile.name };
      writeRemembered(r);
      setRemembered(r);
    }
  }, [profile && profile.id]);

  // ── live data subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (!profile) {
      setStaffAll([]); setEntries([]); setRoster([]); setLeaves([]); setFarmLoc(null); setEntriesReady(false);
      return;
    }
    const admin = profile.role === "admin";
    const unsubs = [];
    const onErr = (n) => (e) => console.error("listener " + n, e);
    const mapDocs = (snap) => snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));

    unsubs.push(onSnapshot(collection(db, "staff"), (s) => setStaffAll(mapDocs(s)), onErr("staff")));

    const eq = admin ? collection(db, "entries") : query(collection(db, "entries"), where("staffId", "==", profile.id));
    unsubs.push(onSnapshot(eq, (s) => { setEntries(mapDocs(s)); setEntriesReady(true); }, onErr("entries")));

    const lq = admin ? collection(db, "leaves") : query(collection(db, "leaves"), where("staffId", "==", profile.id));
    unsubs.push(onSnapshot(lq, (s) => setLeaves(mapDocs(s)), onErr("leaves")));

    unsubs.push(onSnapshot(collection(db, "roster"), (s) => setRoster(mapDocs(s)), onErr("roster")));

    unsubs.push(onSnapshot(collection(db, "settings"), (s) => {
      const loc = mapDocs(s).find((x) => x.id === "location");
      setFarmLoc(loc && loc.lat !== undefined ? { lat: loc.lat, lng: loc.lng } : null);
    }, onErr("settings")));

    return () => unsubs.forEach((u) => u());
  }, [profile && profile.id, profile && profile.role]);

  // ── write helpers (only the changed document is written) ──────────────────
  const saveEntry = async (e) => {
    try { await setDoc(doc(db, "entries", e.id), clean(e)); return true; }
    catch (err) { console.error("saveEntry", err); showToast("Couldn't save. Check your connection and try again.", "err"); return false; }
  };
  const runOnce = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { await fn(); } finally { busyRef.current = false; }
  };

  // ── midnight rule ─────────────────────────────────────────────────────────
  // Any shift still open after midnight (Sydney) of the day it started is
  // closed automatically with exactly 1 hour worked. It is flagged so it can be
  // corrected in the timesheet. This runs whenever the app is open (every
  // minute), and again as soon as anyone opens the app the next day.
  const closingRef = useRef({});
  useEffect(() => {
    if (!profile) return;
    const today = sydKey(new Date().toISOString());
    entries.forEach((e) => {
      if (e.clockOut) return;
      if (sydKey(e.clockIn) >= today) return;
      if (closingRef.current[e.id]) return;
      closingRef.current[e.id] = true;
      const outMs = new Date(e.clockIn).getTime() + 3600000;
      const outISO = new Date(outMs).toISOString();
      const breaks = (e.breaks || [])
        .filter((b) => new Date(b.start).getTime() < outMs)
        .map((b) => Object.assign({}, b, { end: (b.end && new Date(b.end).getTime() <= outMs) ? b.end : outISO }));
      saveEntry(Object.assign({}, e, {
        clockOut: outISO, breaks: breaks, autoClosed: true,
        note: ((e.note ? e.note + " " : "") + "[Auto clocked out at midnight – please check hours]")
      }));
    });
  }, [entries, profile, now.getMinutes()]);

  // ── missed clock-in alert (admin only, while the app is open) ─────────────
  const alertedRef = useRef({});
  useEffect(() => {
    if (!isAdmin) return;
    const p = sydParts(now);
    const todayK = p.year + "-" + p.month + "-" + p.day;
    const nowMins = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
    roster.forEach((sh) => {
      if (sh.date !== todayK || alertedRef.current[sh.id]) return;
      const hm = sh.startTime.split(":").map(Number);
      const diff = nowMins - (hm[0] * 60 + hm[1]);
      if (diff < 15 || diff > 240) return;
      const s = staffAll.find((x) => x.id === sh.staffId);
      if (!s) return;
      const clocked = entries.some((e) => e.staffId === s.id && sydKey(e.clockIn) === todayK);
      if (clocked) return;
      alertedRef.current[sh.id] = true;
      showToast("⚠️ " + s.name + " hasn't clocked in (rostered " + sh.startTime + ")", "warn");
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("The Food Farm", { body: s.name + " was rostered at " + sh.startTime + " and hasn't clocked in." });
      }
    });
  }, [now.getMinutes(), isAdmin]);

  // ── NFC link handling ─────────────────────────────────────────────────────
  const finishNfc = () => {
    if (nfcPending !== null) {
      setNfcPending(null);
      try { window.history.replaceState({}, "", window.location.pathname); } catch (e) { /* ignore */ }
    }
  };
  useEffect(() => {
    if (profile && profile.role === "admin" && nfcPending !== null) finishNfc();
  }, [profile && profile.role, nfcPending]);

  // ── my shift (the signed-in person) ───────────────────────────────────────
  const myActive = profile ? entries.find((e) => e.staffId === profile.id && !e.clockOut) : null;
  const myOpenBreak = myActive ? (myActive.breaks || []).find((b) => !b.end) : null;
  const nfcOpen = nfcPending !== null && !!profile && !isAdmin && entriesReady && !showRetro && !showDepts;
  const nfcDept = DEPTS.find((d) => d.id === nfcPending);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const checkGPS = () => new Promise((resolve) => {
    if (!farmLoc) { resolve(true); return; }
    if (!navigator.geolocation) { showToast("Location isn't supported on this device", "err"); resolve(false); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const d = haversine(p.coords.latitude, p.coords.longitude, farmLoc.lat, farmLoc.lng);
        if (d <= 200) resolve(true);
        else { showToast("You're " + Math.round(d) + "m from the farm – too far to clock in/out", "err"); resolve(false); }
      },
      (e) => { showToast(e.message || "Couldn't get your location", "err"); resolve(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ── clock actions ─────────────────────────────────────────────────────────
  const doClockIn = (deptId) => runOnce(async () => {
    setShowDepts(false);
    if (!profile) return;
    if (myActive) { showToast("You already have an active shift", "err"); finishNfc(); return; }
    if (!(await checkGPS())) return;
    const entry = {
      id: "e_" + Date.now() + "_" + profile.id.slice(0, 4),
      staffId: profile.id, staffName: profile.name, department: deptId,
      clockIn: new Date().toISOString(), clockOut: null, breaks: [], note: ""
    };
    if (await saveEntry(entry)) showToast("Clocked in – " + deptLabel(deptId));
    finishNfc();
  });

  const startClockOut = () => runOnce(async () => {
    if (!myActive) return;
    if (!(await checkGPS())) return;
    setRetroRows([]);
    setShowRetro(true);
  });

  const finaliseClockOut = () => runOnce(async () => {
    if (!myActive) { setShowRetro(false); finishNfc(); return; }
    const outISO = new Date().toISOString();
    const existing = (myActive.breaks || []).map((b) => (b.end ? b : Object.assign({}, b, { end: outISO })));
    const extra = placeBreaks(retroRows, myActive.clockIn, outISO);
    const updated = Object.assign({}, myActive, { breaks: existing.concat(extra), clockOut: outISO });
    if (await saveEntry(updated)) showToast("Clocked out – " + fmtDur(entryStats(updated).worked) + " worked");
    setShowRetro(false);
    setRetroRows([]);
    finishNfc();
  });

  const doBreakStart = (type) => runOnce(async () => {
    if (!myActive || myOpenBreak) return;
    const breaks = (myActive.breaks || []).concat([{ type: type, start: new Date().toISOString(), end: null }]);
    if (await saveEntry(Object.assign({}, myActive, { breaks: breaks }))) showToast(type === "meal" ? "Meal break started" : "Rest break started");
  });

  const doBreakEnd = () => runOnce(async () => {
    if (!myActive || !myOpenBreak) return;
    const outISO = new Date().toISOString();
    const breaks = (myActive.breaks || []).map((b) => (b === myOpenBreak ? Object.assign({}, b, { end: outISO }) : b));
    if (await saveEntry(Object.assign({}, myActive, { breaks: breaks }))) showToast("Break ended");
  });

  // ── editing an entry (past times only) ────────────────────────────────────
  const openEdit = (e) => {
    setEditingEntry(e);
    setEeIn(isoToSydInput(e.clockIn));
    setEeOut(isoToSydInput(e.clockOut));
    setEeNote(e.note || "");
  };
  const doSaveEdit = () => runOnce(async () => {
    const nowMs = Date.now();
    const inISO = sydInputToISO(eeIn);
    const outISO = eeOut ? sydInputToISO(eeOut) : null;
    if (!inISO) { showToast("Please enter a clock-in time", "err"); return; }
    if (new Date(inISO).getTime() > nowMs) { showToast("Clock-in can't be in the future", "err"); return; }
    if (outISO && new Date(outISO).getTime() > nowMs) { showToast("Clock-out can't be in the future", "err"); return; }
    if (outISO && new Date(outISO).getTime() <= new Date(inISO).getTime()) { showToast("Clock-out must be after clock-in", "err"); return; }
    const updated = Object.assign({}, editingEntry, {
      clockIn: inISO, clockOut: outISO, note: eeNote, edited: true,
      editedBy: profile.name, editedAt: new Date().toISOString()
    });
    if (await saveEntry(updated)) { setEditingEntry(null); showToast("Entry updated"); }
  });

  const openBreakEditor = (e) => {
    if (!e.clockOut) { showToast("Finish the shift first, then you can edit its breaks", "warn"); return; }
    const rows = calcBreakSummary(e.breaks).map((b) => ({
      type: b.type || "rest", minutes: String(Math.round(b.ms / 60000)), startInput: isoToSydInput(b.start)
    }));
    setBreakEdit({ entry: e, rows: rows });
  };
  const updateBreakRow = (i, field, val) => setBreakEdit((prev) => ({ entry: prev.entry, rows: prev.rows.map((r, idx) => (idx === i ? Object.assign({}, r, { [field]: val }) : r)) }));
  const doSaveBreaks = () => runOnce(async () => {
    const e = breakEdit.entry;
    const placed = placeBreaks(breakEdit.rows, e.clockIn, e.clockOut);
    const nowMs = Date.now();
    if (placed.some((b) => new Date(b.end).getTime() > nowMs)) { showToast("Breaks can't end in the future", "err"); return; }
    const updated = Object.assign({}, e, { breaks: placed, edited: true, editedBy: profile.name, editedAt: new Date().toISOString() });
    if (await saveEntry(updated)) { setBreakEdit(null); showToast("Breaks updated"); }
  });

  const doDeleteEntry = (id) => runOnce(async () => {
    try { await deleteDoc(doc(db, "entries", id)); showToast("Entry deleted"); }
    catch (err) { console.error(err); showToast("Couldn't delete that entry", "err"); }
    setDeleteConfirm(null);
  });

  // ── login ─────────────────────────────────────────────────────────────────
  const doLogin = async () => {
    if (!lgEmail.trim() || !lgPass) { setLgErr("Enter your email and password."); return; }
    setLgBusy(true); setLgErr(""); setLgInfo("");
    try { await signInWithEmailAndPassword(auth, lgEmail.trim(), lgPass); setLgPass(""); }
    catch (e) { setLgErr(authMessage(e)); }
    setLgBusy(false);
  };
  const doForgot = async () => {
    if (!lgEmail.trim()) { setLgErr("Type your email above first, then tap 'Forgot password'."); return; }
    setLgErr(""); setLgInfo("");
    try { await sendPasswordResetEmail(auth, lgEmail.trim()); setLgInfo("If that email has an account, a reset link is on its way."); }
    catch (e) { setLgErr(authMessage(e)); }
  };
  const forgetUser = () => {
    writeRemembered(null); setRemembered(null);
    setLgEmail(""); setLgPass(""); setLgErr(""); setLgInfo("");
  };
  const doSignOut = async () => { try { await signOut(auth); } catch (e) { console.error(e); } };

  const doChangePassword = async () => {
    if (!pwCur || !pwNew) { showToast("Fill in all the password fields", "err"); return; }
    if (pwNew.length < 6) { showToast("New password must be at least 6 characters", "err"); return; }
    if (pwNew !== pwNew2) { showToast("The new passwords don't match", "err"); return; }
    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(authUser.email, pwCur);
      await reauthenticateWithCredential(authUser, cred);
      await updatePassword(authUser, pwNew);
      setShowPw(false); setPwCur(""); setPwNew(""); setPwNew2("");
      showToast("Password updated");
    } catch (e) { showToast(authMessage(e), "err"); }
    setPwBusy(false);
  };

  // ── staff admin ───────────────────────────────────────────────────────────
  const createStaffAccount = async (name, email, password, role) => {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    const p = { id: uid, name: name, email: email.toLowerCase(), role: role || "staff", active: true, createdAt: new Date().toISOString() };
    await setDoc(doc(db, "staff", uid), p);
    return p;
  };

  const openAddStaff = () => { setNsName(""); setNsEmail(""); setNsPass(genPassword()); setNsRole("staff"); setShowAddStaff(true); };
  const doAddStaff = async () => {
    if (!nsName.trim() || !nsEmail.trim()) { showToast("Enter a name and email", "err"); return; }
    if (nsPass.length < 6) { showToast("Password must be at least 6 characters", "err"); return; }
    setNsBusy(true);
    try {
      await createStaffAccount(nsName.trim(), nsEmail.trim(), nsPass, nsRole);
      setShowAddStaff(false);
      setCredList([{ name: nsName.trim(), email: nsEmail.trim().toLowerCase(), password: nsPass, status: "Created" }]);
    } catch (e) { showToast(authMessage(e), "err"); }
    setNsBusy(false);
  };

  const openBulk = () => {
    const existing = everyone.map((s) => s.name.toLowerCase());
    setBulkRows(TEAM_NAMES.filter((n) => existing.indexOf(n.toLowerCase()) === -1).map((n) => ({ name: n, email: "", password: genPassword() })));
    setShowBulk(true);
  };
  const doBulk = async () => {
    const todo = bulkRows.filter((r) => r.email.trim());
    if (!todo.length) { showToast("Enter at least one email address", "err"); return; }
    setBulkBusy(true);
    const results = [];
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      try {
        await createStaffAccount(r.name, r.email.trim(), r.password, "staff");
        results.push({ name: r.name, email: r.email.trim().toLowerCase(), password: r.password, status: "Created" });
      } catch (e) {
        results.push({ name: r.name, email: r.email.trim().toLowerCase(), password: "", status: "Failed: " + authMessage(e) });
      }
    }
    setBulkBusy(false);
    setShowBulk(false);
    setCredList(results);
  };

  const sendReset = async (s) => {
    try { await sendPasswordResetEmail(auth, s.email); showToast("Password reset email sent to " + s.email); }
    catch (e) { showToast(authMessage(e), "err"); }
  };
  const toggleActive = async (s) => {
    try { await setDoc(doc(db, "staff", s.id), clean(Object.assign({}, s, { active: s.active === false })), { merge: false }); showToast(s.active === false ? s.name + " reactivated" : s.name + " deactivated"); }
    catch (e) { showToast("Couldn't update " + s.name, "err"); }
  };
  const doSaveStaffName = async () => {
    if (!esName.trim()) { showToast("Name can't be empty", "err"); return; }
    try { await setDoc(doc(db, "staff", editStaff.id), clean(Object.assign({}, editStaff, { name: esName.trim() }))); setEditStaff(null); showToast("Name updated"); }
    catch (e) { showToast("Couldn't update the name", "err"); }
  };

  // ── roster ────────────────────────────────────────────────────────────────
  const doAddShift = async () => {
    if (!frStaff || !frDate || !frStart) { showToast("Fill in staff, date and start time", "err"); return; }
    const sh = { id: "r_" + Date.now(), staffId: frStaff, date: frDate, startTime: frStart, endTime: frEnd };
    try { await setDoc(doc(db, "roster", sh.id), clean(sh)); setShowAddRoster(false); setFrStaff(""); setFrDate(""); setFrStart(""); setFrEnd(""); showToast("Shift added"); }
    catch (e) { showToast("Couldn't add that shift", "err"); }
  };

  // ── leave ─────────────────────────────────────────────────────────────────
  const doSubmitLeave = async () => {
    if (!flFrom || !flTo) { showToast("Choose your from and to dates", "err"); return; }
    if (flTo < flFrom) { showToast("The end date is before the start date", "err"); return; }
    const req = {
      id: "l_" + Date.now(), staffId: profile.id, staffName: profile.name,
      from: flFrom, to: flTo, type: flType, note: flNote, status: "pending", submitted: new Date().toISOString()
    };
    try { await setDoc(doc(db, "leaves", req.id), clean(req)); }
    catch (e) { showToast("Couldn't submit your request", "err"); return; }
    setShowLeaveForm(false); setFlFrom(""); setFlTo(""); setFlNote(""); setFlType("annual");
    showToast("Leave request sent to Hannah");
    mailto(MANAGER, "Leave request – " + profile.name,
      "Hi Hannah,\n\n" + profile.name + " has requested " + flType + " leave.\n\nFrom: " + flFrom + "\nTo: " + flTo + "\nNote: " + (flNote || "—") + "\n\nYou can approve or decline it in the Time Ledger app.\n");
  };
  const setLeaveStatus = async (l, status) => {
    try { await setDoc(doc(db, "leaves", l.id), clean(Object.assign({}, l, { status: status }))); showToast("Leave " + status); }
    catch (e) { showToast("Couldn't update that request", "err"); }
  };

  // ── location ──────────────────────────────────────────────────────────────
  const pinLocation = () => {
    if (!navigator.geolocation) { showToast("Location isn't supported here", "err"); return; }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try { await setDoc(doc(db, "settings", "location"), { lat: p.coords.latitude, lng: p.coords.longitude }); showToast("Farm location saved"); }
        catch (e) { showToast("Couldn't save the location", "err"); }
      },
      (e) => showToast(e.message || "Couldn't get your location", "err"),
      { enableHighAccuracy: true }
    );
  };
  const removeLocation = async () => {
    try { await deleteDoc(doc(db, "settings", "location")); showToast("Location check turned off"); }
    catch (e) { showToast("Couldn't update that setting", "err"); }
  };
  const copyText = async (t) => {
    try { await navigator.clipboard.writeText(t); showToast("Copied"); }
    catch (e) { showToast("Couldn't copy – select the text and copy it manually", "warn"); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════
  const buildWeekReport = (weekKey, personId) => {
    const to = addDaysKey(weekKey, 6);
    const people = {};
    const depts = {};
    let activeCount = 0;
    entries.forEach((e) => {
      if (personId !== "all" && e.staffId !== personId) return;
      const k = sydKey(e.clockIn);
      if (k < weekKey || k > to) return;
      if (!e.clockOut) { activeCount++; return; }
      const st = entryStats(e);
      let P = people[e.staffId];
      if (!P) {
        P = { id: e.staffId, name: e.staffName || "Unknown", days: {}, worked: 0, breakMs: 0, paidMs: 0, unpaidMs: 0, weekday: 0, sat: 0, sun: 0, shifts: 0 };
        people[e.staffId] = P;
      }
      let D = P.days[k];
      if (!D) { D = { key: k, entries: [], worked: 0, breakMs: 0, paidMs: 0, unpaidMs: 0 }; P.days[k] = D; }
      D.entries.push(e);
      D.worked += st.worked; D.breakMs += st.breakMs; D.paidMs += st.paidMs; D.unpaidMs += st.unpaidMs;
      P.worked += st.worked; P.breakMs += st.breakMs; P.paidMs += st.paidMs; P.unpaidMs += st.unpaidMs; P.shifts++;
      const dow = dowOfKey(k);
      if (dow === 6) P.sat += st.worked; else if (dow === 0) P.sun += st.worked; else P.weekday += st.worked;
      depts[e.department] = (depts[e.department] || 0) + st.worked;
    });
    const list = Object.values(people).sort((a, b) => a.name.localeCompare(b.name));
    return { list: list, depts: depts, activeCount: activeCount, from: weekKey, to: to };
  };

  const exportWeekCSV = (rep) => {
    const rows = [["Staff", "Date", "Day", "Departments", "Clock in", "Clock out", "Break total (min)", "Paid break (min)", "Unpaid break deducted (min)", "Worked (hours)", "Day type"]];
    rep.list.forEach((P) => {
      Object.keys(P.days).sort().forEach((k) => {
        const D = P.days[k];
        const sorted = D.entries.slice().sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));
        const dow = dowOfKey(k);
        const type = HOLIDAYS[k] ? "Public holiday – " + HOLIDAYS[k] : (dow === 6 ? "Saturday" : dow === 0 ? "Sunday" : "Weekday");
        rows.push([
          P.name, k, keyToDate(k).toLocaleDateString("en-AU", { weekday: "long" }),
          Array.from(new Set(sorted.map((e) => deptLabel(e.department)))).join(" / "),
          sorted.map((e) => fmtTime(e.clockIn)).join(" | "),
          sorted.map((e) => fmtTime(e.clockOut)).join(" | "),
          Math.round(D.breakMs / 60000), Math.round(D.paidMs / 60000), Math.round(D.unpaidMs / 60000), fmtHrs(D.worked), type
        ]);
      });
    });
    rows.push([]);
    rows.push(["WEEKLY SUMMARY – " + weekLabel(rep.from)]);
    rows.push(["Staff", "Mon–Fri hours", "Saturday hours", "Sunday hours", "Total hours", "Break total (min)", "Unpaid break deducted (min)"]);
    rep.list.forEach((P) => {
      rows.push([P.name, fmtHrs(P.weekday), fmtHrs(P.sat), fmtHrs(P.sun), fmtHrs(P.worked), Math.round(P.breakMs / 60000), Math.round(P.unpaidMs / 60000)]);
    });
    downloadCSV("foodfarm-hours-" + rep.from + ".csv", rows);
    showToast("Exported week of " + fmtKey(rep.from));
  };

  const emailWeekSummary = (rep) => {
    let body = "The Food Farm – hours summary\nWeek: " + weekLabel(rep.from) + "\n\n";
    if (!rep.list.length) body += "No completed shifts this week.\n";
    rep.list.forEach((P) => {
      body += P.name + " – total " + fmtDur(P.worked) + "\n";
      body += "  Mon–Fri: " + fmtDur(P.weekday) + "\n";
      body += "  Saturday: " + fmtDur(P.sat) + "\n";
      body += "  Sunday: " + fmtDur(P.sun) + "\n";
      body += "  Breaks: " + fmtDur(P.breakMs) + " (" + fmtDur(P.unpaidMs) + " unpaid, deducted)\n\n";
    });
    mailto(MANAGER, "The Food Farm – hours " + weekLabel(rep.from), body);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED RENDER PIECES
  // ═══════════════════════════════════════════════════════════════════════════
  const NAV = isAdmin
    ? [
      { sec: "Overview", items: [{ id: "live", label: "Live", short: "Live", Icon: Activity }] },
      { sec: "Time", items: [{ id: "timesheets", label: "Timesheets", short: "Hours", Icon: History }, { id: "reports", label: "Reports", short: "Reports", Icon: BarChart2 }] },
      { sec: "Planning", items: [{ id: "roster", label: "Roster", short: "Roster", Icon: Calendar }, { id: "leave", label: "Leave", short: "Leave", Icon: Calendar }] },
      { sec: "Admin", items: [{ id: "staff", label: "Team", short: "Team", Icon: Users }, { id: "settings", label: "Settings", short: "Settings", Icon: Settings }] }
    ]
    : [
      { sec: "Time", items: [{ id: "clock", label: "Clock in / out", short: "Clock", Icon: Clock }, { id: "timesheets", label: "My timesheet", short: "Hours", Icon: History }, { id: "reports", label: "My reports", short: "Reports", Icon: BarChart2 }] },
      { sec: "Planning", items: [{ id: "leave", label: "Leave", short: "Leave", Icon: Calendar }] },
      { sec: "Account", items: [{ id: "profile", label: "Profile", short: "Profile", Icon: User }] }
    ];
  const NAV_FLAT = NAV.reduce((a, g) => a.concat(g.items), []);
  const pageLabel = (NAV_FLAT.find((n) => n.id === view) || { label: "" }).label;

  const groupByWeek = (list) => {
    const map = {};
    list.forEach((e) => {
      const mk = mondayKey(sydKey(e.clockIn));
      if (!map[mk]) map[mk] = { key: mk, entries: [], worked: 0, breakMs: 0, unpaidMs: 0 };
      const st = entryStats(e);
      map[mk].entries.push(e);
      map[mk].worked += st.worked; map[mk].breakMs += st.breakMs; map[mk].unpaidMs += st.unpaidMs;
    });
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  };

  const renderEntryTable = (list, canDelete) => (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr><th>Date</th><th>Dept</th><th>In</th><th>Out</th><th>Breaks</th><th>Worked</th><th></th></tr>
        </thead>
        <tbody>
          {list.slice().sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn)).map((e) => {
            const st = entryStats(e);
            return (
              <tr key={e.id}>
                <td className="mono">{fmtDateShort(e.clockIn)}</td>
                <td className="muted">{deptLabel(e.department)}</td>
                <td className="mono">{fmtTime(e.clockIn)}</td>
                <td className="mono">{e.clockOut ? fmtTime(e.clockOut) : <span className="badge b-green">Active</span>}</td>
                <td className="mono muted">
                  {st.breakMs > 0 ? fmtDur(st.breakMs) : "—"}
                  {st.unpaidMs > 0 ? <span className="small"> · {fmtDur(st.unpaidMs)} unpaid</span> : null}
                </td>
                <td className="mono strong">
                  {fmtDur(st.worked)}
                  {e.autoClosed ? <span className="badge b-amber" style={{ marginLeft: 6 }}>Auto</span> : null}
                  {e.edited ? <span className="badge b-gray" style={{ marginLeft: 6 }}>Edited</span> : null}
                </td>
                <td>
                  <div className="row gap4">
                    <button className="btn btn-g btn-sm" title="Edit breaks" onClick={() => openBreakEditor(e)}><Coffee size={14} /></button>
                    <button className="btn btn-g btn-sm" title="Edit times" onClick={() => openEdit(e)}><Edit2 size={14} /></button>
                    {canDelete ? <button className="btn btn-g btn-sm" style={{ color: "var(--red)" }} title="Delete" onClick={() => setDeleteConfirm(e)}><Trash2 size={14} /></button> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderWeekBlocks = (list, canDelete, idPrefix) => {
    const weeks = groupByWeek(list);
    return weeks.map((w, idx) => {
      const k = idPrefix + w.key;
      const isOpen = openWk[k] !== undefined ? openWk[k] : idx === 0;
      return (
        <div key={k} className="card mb12">
          <div className="card-h" style={{ cursor: "pointer", borderBottom: isOpen ? undefined : "none" }} onClick={() => setOpenWk((p) => Object.assign({}, p, { [k]: !isOpen }))}>
            <div className="row gap8">
              <ChevronRight size={16} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
              <div className="card-t">Week of {weekLabel(w.key)}</div>
            </div>
            <div className="row gap8 wrap">
              <span className="badge b-gray">Breaks {fmtDur(w.breakMs)}</span>
              <span className="badge b-green">{fmtDur(w.worked)} worked</span>
            </div>
          </div>
          {isOpen ? renderEntryTable(w.entries, canDelete) : null}
        </div>
      );
    });
  };

  const renderCalendar = (mode) => (
    <div className="card mb16">
      <div className="card-h">
        <div className="row gap8">
          <button className="btn btn-g btn-sm" onClick={() => setCalMo((p) => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}><ChevronLeft size={16} /></button>
          <div className="card-t" style={{ minWidth: 130, textAlign: "center" }}>{new Date(calMo.y, calMo.m, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</div>
          <button className="btn btn-g btn-sm" onClick={() => setCalMo((p) => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}><ChevronRight size={16} /></button>
        </div>
        <div className="row gap8 wrap">
          <span className="badge b-amber">Public holiday</span>
          {mode === "leave" ? <span className="badge b-blue">Approved leave</span> : <span className="badge b-green">Shift</span>}
          {mode === "leave" ? <span className="badge b-gray">Pending</span> : null}
        </div>
      </div>
      <div className="card-b">
        <div className="cal-grid" style={{ marginBottom: 6 }}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="cal-dh">{d}</div>)}</div>
        <div className="cal-grid">
          {Array(firstDOW(calMo.y, calMo.m)).fill(null).map((_, i) => <div key={"e" + i} className="cal-day empty" />)}
          {Array(daysInMonth(calMo.y, calMo.m)).fill(null).map((_, i) => {
            const day = i + 1;
            const dk = calMo.y + "-" + String(calMo.m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
            const hol = HOLIDAYS[dk];
            const shifts = mode === "roster" ? roster.filter((r) => r.date === dk) : [];
            const appr = mode === "leave" ? leaves.filter((l) => l.from <= dk && l.to >= dk && l.status === "approved") : [];
            const pend = mode === "leave" ? leaves.filter((l) => l.from <= dk && l.to >= dk && l.status === "pending") : [];
            return (
              <div key={day} className={"cal-day" + (dk === todayKey ? " today" : "") + (hol ? " hol" : "")}>
                <div className="cal-num">{day}</div>
                {hol ? <div className="cal-chip" style={{ color: "var(--amber)", fontWeight: 600 }}>{hol}</div> : null}
                {shifts.map((s) => { const st = staffAll.find((x) => x.id === s.staffId); return <div key={s.id} className="cal-chip" style={{ background: "var(--greenbg)", color: "var(--green)" }}>{st ? st.name : "?"} {s.startTime}</div>; })}
                {appr.map((l) => <div key={l.id} className="cal-chip" style={{ background: "var(--bluebg)", color: "var(--blue)" }}>{l.staffName}</div>)}
                {pend.map((l) => <div key={l.id} className="cal-chip" style={{ background: "#efeff1", color: "var(--ink2)" }}>{l.staffName}?</div>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderAccountCard = () => (
    <div className="card mb16">
      <div className="card-h"><div className="card-t">Your account</div></div>
      <div className="card-b">
        <div className="col gap8 mb16">
          <div className="row gap8"><User size={15} className="muted" /><span className="strong">{profile.name}</span><span className="badge b-gray">{isAdmin ? "Admin" : "Team member"}</span></div>
          <div className="row gap8 muted"><Mail size={15} /><span>{profile.email}</span></div>
        </div>
        <div className="row gap8 wrap">
          <button className="btn btn-o" onClick={() => { setPwCur(""); setPwNew(""); setPwNew2(""); setShowPw(true); }}><Lock size={14} /> Change password</button>
          <button className="btn btn-o" onClick={doSignOut}><LogOut size={14} /> Sign out</button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Admin: live overview ──────────────────────────────────────────────────
  const renderLive = () => {
    const activeNow = entries.filter((e) => !e.clockOut).sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));
    const onBreak = activeNow.filter((e) => (e.breaks || []).some((b) => !b.end));
    const todayShifts = roster.filter((r) => r.date === todayKey).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const pending = leaves.filter((l) => l.status === "pending");
    const p = sydParts(now);
    const nowMins = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
    return (
      <div className="page">
        <div className="kpi-grid">
          <div className="kpi red"><div className="kpi-val">{activeNow.length - onBreak.length}</div><div className="kpi-lbl">Working now</div></div>
          <div className="kpi"><div className="kpi-val">{onBreak.length}</div><div className="kpi-lbl">On a break</div></div>
          <div className="kpi"><div className="kpi-val">{todayShifts.length}</div><div className="kpi-lbl">Rostered today</div></div>
          <div className="kpi"><div className="kpi-val">{pending.length}</div><div className="kpi-lbl">Leave requests waiting</div></div>
        </div>
        <div className="g2" style={{ alignItems: "start" }}>
          <div className="card">
            <div className="card-h"><div className="card-t">Active now</div><span className="badge b-green">{activeNow.length} on shift</span></div>
            {activeNow.length === 0
              ? <div className="card-b muted" style={{ fontStyle: "italic" }}>Nobody is clocked in right now.</div>
              : <ul className="break-list">
                {activeNow.map((e) => {
                  const ob = (e.breaks || []).find((b) => !b.end);
                  return (
                    <li key={e.id}>
                      <div>
                        <div className="strong">{e.staffName}</div>
                        <div className="small muted">{deptLabel(e.department)} · since {fmtTime(e.clockIn)} · {fmtDur(entryStats(e).worked)} so far</div>
                      </div>
                      {ob ? <span className="badge b-amber"><Coffee size={11} /> {ob.type === "meal" ? "Meal break" : "Rest break"}</span> : <span className="badge b-green">Working</span>}
                    </li>
                  );
                })}
              </ul>}
          </div>
          <div className="col gap16">
            <div className="card">
              <div className="card-h"><div className="card-t">Today's roster</div></div>
              {todayShifts.length === 0
                ? <div className="card-b muted" style={{ fontStyle: "italic" }}>No shifts rostered today.</div>
                : <ul className="break-list">
                  {todayShifts.map((r) => {
                    const s = staffAll.find((x) => x.id === r.staffId);
                    const clocked = entries.some((e) => e.staffId === r.staffId && sydKey(e.clockIn) === todayKey);
                    const hm = r.startTime.split(":").map(Number);
                    const late = !clocked && nowMins - (hm[0] * 60 + hm[1]) >= 15;
                    return (
                      <li key={r.id}>
                        <div><span className="strong">{s ? s.name : "—"}</span> <span className="small muted mono">{r.startTime}{r.endTime ? " – " + r.endTime : ""}</span></div>
                        {clocked ? <span className="badge b-green">In</span> : late ? <span className="badge b-red">Not in yet</span> : <span className="badge b-gray">Upcoming</span>}
                      </li>
                    );
                  })}
                </ul>}
            </div>
            {pending.length > 0 ? (
              <div className="card">
                <div className="card-h"><div className="card-t">Leave waiting for you</div><button className="btn btn-o btn-sm" onClick={() => setView("leave")}>Review</button></div>
                <ul className="break-list">
                  {pending.slice(0, 5).map((l) => <li key={l.id}><span className="strong">{l.staffName}</span><span className="small muted">{l.from} → {l.to}</span></li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  // ── Staff: clock page ─────────────────────────────────────────────────────
  const renderClock = () => {
    const weekStart = mondayKey(todayKey);
    const myWeek = entries.filter((e) => e.staffId === profile.id && sydKey(e.clockIn) >= weekStart);
    const weekWorked = myWeek.reduce((a, e) => a + entryStats(e).worked, 0);
    const upcoming = roster.filter((r) => r.staffId === profile.id && r.date >= todayKey && r.date <= addDaysKey(todayKey, 7)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const heroClass = myActive ? (myOpenBreak ? "status-hero brk" : "status-hero on") : "status-hero off";
    return (
      <div className="page">
        <div className="g2" style={{ alignItems: "start" }}>
          <div className="col gap16">
            <div className="card">
              <div className="card-b">
                <div className={heroClass}>
                  <div className="small muted" style={{ marginBottom: 4 }}>Hi {profile.name}</div>
                  {!myActive ? <div className="big">You're clocked out</div> : null}
                  {myActive && !myOpenBreak ? <div className="big">Working · {fmtDur(entryStats(myActive).worked)}</div> : null}
                  {myActive && myOpenBreak ? <div className="big">{myOpenBreak.type === "meal" ? "On meal break" : "On rest break"}</div> : null}
                  {myActive ? <div className="small muted" style={{ marginTop: 4 }}>{deptLabel(myActive.department)} · since {fmtTime(myActive.clockIn)}</div> : null}
                </div>
                <div className="col gap8">
                  {!myActive ? <button className="btn btn-p btn-lg" onClick={() => setShowDepts(true)}><LogIn size={18} /> Clock in</button> : null}
                  {myActive && !myOpenBreak ? (
                    <>
                      <button className="btn btn-amber btn-lg" onClick={() => doBreakStart("rest")}><Coffee size={18} /> Start rest break</button>
                      <button className="btn btn-amber btn-lg" onClick={() => doBreakStart("meal")}><Utensils size={18} /> Start meal break</button>
                      <button className="btn btn-d btn-lg" onClick={startClockOut}><LogOut size={18} /> Clock out</button>
                    </>
                  ) : null}
                  {myActive && myOpenBreak ? (
                    <>
                      <button className="btn btn-blue btn-lg" onClick={doBreakEnd}><Coffee size={18} /> End break</button>
                      <button className="btn btn-o btn-lg" onClick={startClockOut}><LogOut size={18} /> Clock out</button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-b">
                <div className="small muted" style={{ lineHeight: 1.6 }}>
                  <b>Breaks:</b> 20 minutes of break time in total is paid. A meal break's first 30 minutes are unpaid. Unpaid break time is taken off your worked hours.
                </div>
              </div>
            </div>
          </div>
          <div className="col gap16">
            <div className="kpi red"><div className="kpi-val">{fmtDur(weekWorked)}</div><div className="kpi-lbl">Worked this week so far</div></div>
            <div className="card">
              <div className="card-h"><div className="card-t">Your next shifts</div></div>
              {upcoming.length === 0
                ? <div className="card-b muted" style={{ fontStyle: "italic" }}>No shifts rostered in the next 7 days.</div>
                : <ul className="break-list">{upcoming.map((r) => <li key={r.id}><span className="strong">{fmtKey(r.date)}</span><span className="mono muted">{r.startTime}{r.endTime ? " – " + r.endTime : ""}</span></li>)}</ul>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Timesheets ────────────────────────────────────────────────────────────
  const renderTimesheets = () => {
    if (!isAdmin) {
      const mine = entries.filter((e) => e.staffId === profile.id);
      return (
        <div className="page">
          <p className="muted mb16" style={{ fontSize: 13 }}>Tap a week to open it. You can fix a shift's times or breaks if you forgot something, but not for the future.</p>
          {mine.length === 0 ? <div className="card"><div className="card-b muted" style={{ textAlign: "center", fontStyle: "italic" }}>No shifts yet.</div></div> : renderWeekBlocks(mine, false, "me-")}
        </div>
      );
    }
    const people = {};
    entries.forEach((e) => {
      if (tsPerson !== "all" && e.staffId !== tsPerson) return;
      if (!people[e.staffId]) people[e.staffId] = { id: e.staffId, name: e.staffName || "Unknown", list: [] };
      people[e.staffId].list.push(e);
    });
    const plist = Object.values(people).sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div className="page">
        <div className="filter-bar">
          <select className="finp" style={{ width: 220 }} value={tsPerson} onChange={(e) => setTsPerson(e.target.value)}>
            <option value="all">Everyone</option>
            {everyone.filter((s) => s.role === "staff").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="muted small">{entries.length} shifts in total · for week-by-week hours and export, use Reports</span>
        </div>
        {plist.length === 0 ? <div className="card"><div className="card-b muted" style={{ textAlign: "center", fontStyle: "italic" }}>No entries yet.</div></div> : null}
        {plist.map((P) => (
          <div key={P.id} style={{ marginBottom: 26 }}>
            <div className="row between mb12">
              <div style={{ fontSize: 18, fontWeight: 600 }}>{P.name}</div>
              <span className="badge b-gray">All time: {fmtDur(P.list.reduce((a, e) => a + entryStats(e).worked, 0))}</span>
            </div>
            {renderWeekBlocks(P.list, true, P.id + "-")}
          </div>
        ))}
      </div>
    );
  };

  // ── Reports ───────────────────────────────────────────────────────────────
  const renderReports = () => {
    if (!isAdmin) {
      const weeks = groupByWeek(entries.filter((e) => e.staffId === profile.id));
      const thisWk = weeks.find((w) => w.key === mondayKey(todayKey));
      const lastWk = weeks.find((w) => w.key === addDaysKey(mondayKey(todayKey), -7));
      return (
        <div className="page" style={{ maxWidth: 720 }}>
          <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="kpi red"><div className="kpi-val">{fmtDur(thisWk ? thisWk.worked : 0)}</div><div className="kpi-lbl">This week</div></div>
            <div className="kpi"><div className="kpi-val">{fmtDur(lastWk ? lastWk.worked : 0)}</div><div className="kpi-lbl">Last week</div></div>
          </div>
          <div className="card">
            <div className="card-h"><div className="card-t">Hours by week</div></div>
            {weeks.length === 0
              ? <div className="card-b muted" style={{ fontStyle: "italic" }}>Your weekly totals will appear here after your first shift.</div>
              : <div className="tbl-wrap"><table>
                <thead><tr><th>Week</th><th>Shifts</th><th>Breaks</th><th>Worked</th></tr></thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.key}>
                      <td className="strong">{weekLabel(w.key)}</td>
                      <td className="mono">{w.entries.length}</td>
                      <td className="mono muted">{fmtDur(w.breakMs)}</td>
                      <td className="mono strong">{fmtDur(w.worked)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>}
          </div>
        </div>
      );
    }

    const rep = buildWeekReport(rptWeek, rptPerson);
    const totWorked = rep.list.reduce((a, P) => a + P.worked, 0);
    const totBreak = rep.list.reduce((a, P) => a + P.breakMs, 0);
    const totUnpaid = rep.list.reduce((a, P) => a + P.unpaidMs, 0);
    const deptList = DEPTS.map((d) => ({ id: d.id, label: d.label, Icon: d.Icon, ms: rep.depts[d.id] || 0 })).filter((d) => d.ms > 0).sort((a, b) => b.ms - a.ms);
    const maxDept = deptList.length ? deptList[0].ms : 1;
    const curMonday = mondayKey(todayKey);
    return (
      <div className="page">
        <div className="filter-bar">
          <div className="seg">
            <button onClick={() => setRptWeek(addDaysKey(rptWeek, -7))}><ChevronLeft size={16} /></button>
            <div className="lbl">{weekLabel(rptWeek)}</div>
            <button onClick={() => setRptWeek(addDaysKey(rptWeek, 7))}><ChevronRight size={16} /></button>
          </div>
          <input type="date" className="finp" style={{ width: 160 }} value={rptWeek} onChange={(e) => { if (e.target.value) setRptWeek(mondayKey(e.target.value)); }} title="Jump to the week containing this date" />
          {rptWeek !== curMonday ? <button className="btn btn-o" onClick={() => setRptWeek(curMonday)}>This week</button> : null}
          <select className="finp" style={{ width: 190 }} value={rptPerson} onChange={(e) => setRptPerson(e.target.value)}>
            <option value="all">Everyone</option>
            {everyone.filter((s) => s.role === "staff").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button className="btn btn-o" onClick={() => emailWeekSummary(rep)}><Mail size={14} /> Email summary</button>
          <button className="btn btn-p" onClick={() => exportWeekCSV(rep)}><Download size={14} /> Export week</button>
        </div>

        <div className="kpi-grid">
          <div className="kpi red"><div className="kpi-val">{fmtHrs(totWorked)}<small>hrs</small></div><div className="kpi-lbl">Total worked</div></div>
          <div className="kpi"><div className="kpi-val">{fmtDur(totBreak)}</div><div className="kpi-lbl">Total break time</div></div>
          <div className="kpi"><div className="kpi-val">{fmtDur(totUnpaid)}</div><div className="kpi-lbl">Unpaid breaks deducted</div></div>
          <div className="kpi"><div className="kpi-val">{rep.list.length}</div><div className="kpi-lbl">People with hours</div></div>
        </div>
        {rep.activeCount > 0 ? <div className="msg-ok" style={{ background: "var(--amberbg)", color: "var(--amber)" }}>{rep.activeCount} shift{rep.activeCount > 1 ? "s are" : " is"} still open this week and not counted yet.</div> : null}

        {rep.list.length === 0 ? <div className="card mb16"><div className="card-b muted" style={{ textAlign: "center", fontStyle: "italic" }}>No completed shifts in this week.</div></div> : null}

        {rep.list.map((P) => (
          <div key={P.id} className="card mb16">
            <div className="card-h">
              <div style={{ fontSize: 16, fontWeight: 600 }}>{P.name}</div>
              <div className="pill-row">
                <div className="pill">Total<b>{fmtDur(P.worked)}</b></div>
                <div className="pill">Breaks<b>{fmtDur(P.breakMs)}</b></div>
                <div className="pill">Unpaid deducted<b>{fmtDur(P.unpaidMs)}</b></div>
              </div>
            </div>
            <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--line)" }} className="pill-row">
              <div className="pill">Mon–Fri<b>{fmtDur(P.weekday)}</b></div>
              <div className="pill">Saturday<b>{fmtDur(P.sat)}</b></div>
              <div className="pill">Sunday<b>{fmtDur(P.sun)}</b></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Day</th><th>Department</th><th>Clocked</th><th>Breaks</th><th>Unpaid</th><th>Worked</th></tr></thead>
                <tbody>
                  {Object.keys(P.days).sort().map((k) => {
                    const D = P.days[k];
                    const sorted = D.entries.slice().sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn));
                    return (
                      <tr key={k}>
                        <td className="strong">{fmtKey(k)}{HOLIDAYS[k] ? <span className="badge b-amber" style={{ marginLeft: 6 }}>{HOLIDAYS[k]}</span> : null}</td>
                        <td className="muted">{Array.from(new Set(sorted.map((e) => deptLabel(e.department)))).join(", ")}</td>
                        <td className="mono muted">{sorted.map((e) => fmtTime(e.clockIn) + " – " + fmtTime(e.clockOut)).join(", ")}</td>
                        <td className="mono muted">{D.breakMs > 0 ? fmtDur(D.breakMs) : "—"}</td>
                        <td className="mono muted">{D.unpaidMs > 0 ? fmtDur(D.unpaidMs) : "—"}</td>
                        <td className="mono strong">{fmtDur(D.worked)}</td>
                      </tr>
                    );
                  })}
                  <tr className="totalrow">
                    <td>Week total</td><td></td><td></td>
                    <td className="mono">{fmtDur(P.breakMs)}</td>
                    <td className="mono">{fmtDur(P.unpaidMs)}</td>
                    <td className="mono">{fmtDur(P.worked)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {deptList.length > 0 ? (
          <div className="card">
            <div className="card-h"><div className="card-t">Hours by department</div><span className="muted small">{fmtHrs(totWorked)} hrs total</span></div>
            <div className="card-b">
              {deptList.map((d) => (
                <div key={d.id} className="stat-row">
                  <div className="stat-label"><d.Icon size={15} style={{ color: "var(--red)", flexShrink: 0 }} />{d.label}</div>
                  <div className="stat-bar-bg"><div className="stat-bar-fill" style={{ width: ((d.ms / maxDept) * 100) + "%" }} /></div>
                  <div className="stat-val">{fmtHrs(d.ms)}h</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  // ── Roster (admin) ────────────────────────────────────────────────────────
  const renderRoster = () => (
    <div className="page">
      <div className="row between mb16"><div className="muted" style={{ fontSize: 13 }}>Shifts you add here power the "not clocked in" alert.</div>
        <button className="btn btn-p" onClick={() => setShowAddRoster(true)}><Plus size={14} /> Add shift</button></div>
      {renderCalendar("roster")}
      <div className="card">
        <div className="card-h"><div className="card-t">All shifts</div></div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Staff</th><th>Date</th><th>Start</th><th>End</th><th></th></tr></thead>
          <tbody>
            {roster.length === 0 ? <tr><td colSpan={5} className="muted" style={{ textAlign: "center", fontStyle: "italic", padding: 20 }}>No shifts added</td></tr> : null}
            {roster.slice().sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
              const s = staffAll.find((x) => x.id === r.staffId);
              return (
                <tr key={r.id}>
                  <td className="strong">{s ? s.name : "—"}</td>
                  <td className="mono">{r.date}</td><td className="mono">{r.startTime}</td><td className="mono">{r.endTime || "—"}</td>
                  <td><button className="btn btn-g btn-sm" style={{ color: "var(--red)" }} onClick={async () => { try { await deleteDoc(doc(db, "roster", r.id)); showToast("Shift removed"); } catch (e) { showToast("Couldn't remove it", "err"); } }}><X size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );

  // ── Leave ─────────────────────────────────────────────────────────────────
  const renderLeave = () => {
    const list = leaves.slice().sort((a, b) => new Date(b.submitted) - new Date(a.submitted));
    return (
      <div className="page">
        {!isAdmin ? <div className="row between mb16"><div className="muted" style={{ fontSize: 13 }}>Requests go to Hannah and show up here once she replies.</div>
          <button className="btn btn-p" onClick={() => setShowLeaveForm(true)}><Plus size={14} /> Request leave</button></div> : null}
        {renderCalendar("leave")}
        <div className="card">
          <div className="card-h"><div className="card-t">{isAdmin ? "Leave requests" : "My leave requests"}</div></div>
          <div className="tbl-wrap"><table>
            <thead><tr>{isAdmin ? <th>Staff</th> : null}<th>Type</th><th>From</th><th>To</th><th>Note</th><th>Status</th>{isAdmin ? <th></th> : null}</tr></thead>
            <tbody>
              {list.length === 0 ? <tr><td colSpan={7} className="muted" style={{ textAlign: "center", fontStyle: "italic", padding: 20 }}>No requests</td></tr> : null}
              {list.map((l) => (
                <tr key={l.id}>
                  {isAdmin ? <td className="strong">{l.staffName}</td> : null}
                  <td style={{ textTransform: "capitalize" }}>{l.type}</td>
                  <td className="mono">{l.from}</td><td className="mono">{l.to}</td>
                  <td className="muted">{l.note || "—"}</td>
                  <td>{l.status === "approved" ? <span className="badge b-green">Approved</span> : l.status === "declined" ? <span className="badge b-red">Declined</span> : <span className="badge b-amber">Pending</span>}</td>
                  {isAdmin ? (
                    <td>{l.status === "pending" ? (
                      <div className="row gap4">
                        <button className="btn btn-p btn-sm" onClick={() => setLeaveStatus(l, "approved")}><Check size={12} /> Approve</button>
                        <button className="btn btn-o btn-sm" onClick={() => setLeaveStatus(l, "declined")}><X size={12} /> Decline</button>
                      </div>
                    ) : null}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    );
  };

  // ── Team (admin) ──────────────────────────────────────────────────────────
  const renderStaff = () => {
    const wk = mondayKey(todayKey);
    return (
      <div className="page">
        <div className="row between wrap gap8 mb16">
          <div className="muted" style={{ fontSize: 13 }}>{everyone.length} people with a login</div>
          <div className="row gap8 wrap">
            <button className="btn btn-o" onClick={openBulk}><Users size={14} /> Set up the team</button>
            <button className="btn btn-p" onClick={openAddStaff}><UserPlus size={14} /> Add person</button>
          </div>
        </div>
        {everyone.length === 0 ? <div className="card"><div className="card-b muted" style={{ textAlign: "center", fontStyle: "italic" }}>No team members yet. Tap "Set up the team" to create everyone's login in one go.</div></div> : null}
        <div className="g3">
          {everyone.map((s) => {
            const ae = entries.find((e) => e.staffId === s.id && !e.clockOut);
            const wkMs = entries.filter((e) => e.staffId === s.id && sydKey(e.clockIn) >= wk).reduce((a, e) => a + entryStats(e).worked, 0);
            return (
              <div key={s.id} className="card" style={{ opacity: s.active === false ? 0.6 : 1 }}>
                <div className="card-b">
                  <div className="row between mb12">
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</div>
                    {s.role === "admin" ? <span className="badge b-red">Admin</span> : s.active === false ? <span className="badge b-gray">Deactivated</span> : ae ? <span className="badge b-green">On shift</span> : <span className="badge b-gray">Off</span>}
                  </div>
                  <div className="small muted mb12" style={{ wordBreak: "break-all" }}>{s.email}</div>
                  <div className="small muted mb12">This week: <b style={{ color: "var(--ink)" }}>{fmtDur(wkMs)}</b></div>
                  <div className="row gap4 wrap">
                    <button className="btn btn-o btn-sm" onClick={() => { setEditStaff(s); setEsName(s.name); }}><Edit2 size={12} /> Name</button>
                    <button className="btn btn-o btn-sm" onClick={() => sendReset(s)}><Lock size={12} /> Reset password</button>
                    {s.id !== profile.id ? <button className="btn btn-o btn-sm" onClick={() => toggleActive(s)}>{s.active === false ? "Reactivate" : "Deactivate"}</button> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Settings (admin) ──────────────────────────────────────────────────────
  const renderSettings = () => (
    <div className="page" style={{ maxWidth: 680 }}>
      {renderAccountCard()}

      <div className="card mb16">
        <div className="card-h"><div className="card-t">NFC tap-to-clock</div><span className="badge b-blue"><Smartphone size={11} /> Tags</span></div>
        <div className="card-b">
          <p className="muted mb12" style={{ fontSize: 13, lineHeight: 1.6 }}>
            Write one of these links onto an NFC sticker with a free app such as "NFC Tools". When someone taps their phone on the sticker, the app opens (they stay signed in), and one confirm tap clocks them in or out. Put a sticker at each work area to pre-select the department.
          </p>
          {DEPTS.map((d) => (
            <div key={d.id} className="mb12">
              <div className="row between mb12" style={{ marginBottom: 4 }}>
                <span className="strong" style={{ fontSize: 13 }}>{d.label}</span>
                <button className="btn btn-o btn-sm" onClick={() => copyText(APP_URL + "/?nfc=" + d.id)}><Copy size={12} /> Copy</button>
              </div>
              <div className="url-box mono">{APP_URL + "/?nfc=" + d.id}</div>
            </div>
          ))}
          <div className="mb12">
            <div className="row between" style={{ marginBottom: 4 }}>
              <span className="strong" style={{ fontSize: 13 }}>Any area (asks which department)</span>
              <button className="btn btn-o btn-sm" onClick={() => copyText(APP_URL + "/?nfc=any")}><Copy size={12} /> Copy</button>
            </div>
            <div className="url-box mono">{APP_URL + "/?nfc=any"}</div>
          </div>
        </div>
      </div>

      <div className="card mb16">
        <div className="card-h"><div className="card-t">Location check</div></div>
        <div className="card-b">
          <p className="muted mb12" style={{ fontSize: 13 }}>When set, people can only clock in or out within 200m of the farm. Stand at the farm and tap the button to pin it.</p>
          {farmLoc ? (
            <div>
              <div className="row gap8 mb12" style={{ color: "var(--green)", fontSize: 13 }}><CheckCircle2 size={15} /> Pinned at {farmLoc.lat.toFixed(5)}, {farmLoc.lng.toFixed(5)}</div>
              <div className="row gap8"><button className="btn btn-o" onClick={pinLocation}><RefreshCw size={13} /> Update to here</button><button className="btn btn-o" onClick={removeLocation}><X size={13} /> Turn off</button></div>
            </div>
          ) : <button className="btn btn-p" onClick={pinLocation}><MapPin size={14} /> Pin my current location</button>}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><div className="card-t">Browser notifications</div></div>
        <div className="card-b">
          <p className="muted mb12" style={{ fontSize: 13 }}>Alerts you when someone rostered hasn't clocked in 15 minutes after their start time. Alerts only appear while this app is open on your device.</p>
          <button className="btn btn-o" onClick={() => { if (typeof Notification === "undefined") { showToast("This browser doesn't support notifications", "warn"); return; } Notification.requestPermission().then((p) => showToast(p === "granted" ? "Notifications enabled" : "Permission denied", p === "granted" ? "ok" : "err")); }}><Bell size={14} /> Enable notifications</button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP-LEVEL SCREENS (loading / login / blocked)
  // ═══════════════════════════════════════════════════════════════════════════
  const shell = (children) => (<><style>{CSS}</style>{children}</>);

  if (authUser === undefined || (authUser && profileState === "loading")) {
    return shell(<div className="login-wrap"><div style={{ textAlign: "center", color: "var(--ink2)" }}><div style={{ fontSize: 15, fontWeight: 600, color: "var(--red)" }}>The Food Farm</div><div style={{ fontSize: 13, marginTop: 6 }}>Loading…</div></div></div>);
  }

  if (!authUser) {
    return shell(
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-top"><div className="login-logo"><Logo size={64} /></div><h1>The Food Farm</h1><p>Time Ledger · sign in to clock in, check your hours and request leave</p></div>
          <div className="login-body">
            {lgErr ? <div className="msg-err">{lgErr}</div> : null}
            {lgInfo ? <div className="msg-ok">{lgInfo}</div> : null}
            {remembered ? (
              <div className="mb16">
                <div style={{ fontSize: 18, fontWeight: 600 }}>Welcome back, {remembered.name}</div>
                <div className="small muted" style={{ marginTop: 2 }}>{remembered.email}</div>
                <input type="email" autoComplete="username" value={lgEmail} readOnly tabIndex={-1} aria-hidden="true" style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }} />
              </div>
            ) : (
              <div className="fg"><label className="flbl">Email</label><input className="finp" type="email" autoComplete="username" value={lgEmail} onChange={(e) => setLgEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }} placeholder="you@example.com" /></div>
            )}
            <div className="fg"><label className="flbl">Password</label><input className="finp" type="password" autoComplete="current-password" autoFocus={!!remembered} value={lgPass} onChange={(e) => setLgPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }} placeholder="••••••••" /></div>
            <button className="btn btn-p btn-lg" disabled={lgBusy} onClick={doLogin}>{lgBusy ? "Signing in…" : "Sign in"}</button>
            <div style={{ textAlign: "center", marginTop: 16 }}><button className="link-btn" onClick={doForgot}>Forgot password?</button></div>
            {remembered ? <div style={{ textAlign: "center", marginTop: 10 }}><button className="link-btn" style={{ color: "var(--ink2)" }} onClick={forgetUser}>Not {remembered.name}? Use a different account</button></div> : null}
          </div>
        </div>
      </div>
    );
  }

  if (profileState !== "ready" || !profile) {
    const msg = profileState === "inactive" ? "This account has been deactivated. Please contact Hannah."
      : profileState === "missing" ? "Your login works, but your profile hasn't been set up yet. Please ask Hannah to add you in the Team page."
      : "We couldn't load your profile. Check your connection and try again.";
    return shell(
      <div className="login-wrap"><div className="login-card"><div className="login-top"><div className="login-logo"><Logo size={64} /></div><h1>The Food Farm</h1></div>
        <div className="login-body"><div className="msg-err">{msg}</div><button className="btn btn-o btn-lg" onClick={doSignOut}>Sign out</button></div></div></div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════
  return shell(
    <div className="app">
      <aside className="sidebar">
        <div className="sb-logo"><Logo size={44} /><div><div className="sb-title">The Food Farm</div><div className="sb-sub">Time Ledger</div></div></div>
        <nav className="sb-nav">
          {NAV.map((g) => (
            <div key={g.sec}>
              <div className="sb-sec">{g.sec}</div>
              {g.items.map((it) => (
                <button key={it.id} className={view === it.id ? "nav-btn active" : "nav-btn"} onClick={() => setView(it.id)}>
                  <it.Icon size={16} />{it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          <div className="sb-user">{profile.name}</div>
          <div className="sb-role">{isAdmin ? "Admin" : "Team member"}</div>
          <button className="sb-out" onClick={doSignOut}><LogOut size={14} /> Sign out</button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="tb-left"><span className="tb-logo"><Logo size={32} /></span><div className="tb-t">{pageLabel}</div></div>
          <div className="tb-c">{now.toLocaleTimeString("en-AU", { timeZone: SYD, hour: "numeric", minute: "2-digit", second: "2-digit" })} {tzLabel(now)} · Sydney</div>
        </div>

        {view === "live" && isAdmin ? renderLive() : null}
        {view === "clock" && !isAdmin ? renderClock() : null}
        {view === "timesheets" ? renderTimesheets() : null}
        {view === "reports" ? renderReports() : null}
        {view === "roster" && isAdmin ? renderRoster() : null}
        {view === "leave" ? renderLeave() : null}
        {view === "staff" && isAdmin ? renderStaff() : null}
        {view === "settings" && isAdmin ? renderSettings() : null}
        {view === "profile" && !isAdmin ? <div className="page" style={{ maxWidth: 560 }}>{renderAccountCard()}</div> : null}
      </div>

      {/* ═══ MODALS ═══════════════════════════════════════════════════════ */}

      {/* NFC confirm */}
      {nfcOpen ? (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-h"><div><div className="modal-t">{myActive ? "Clock out?" : (nfcDept ? "Clock in to " + nfcDept.label + "?" : "Clock in")}</div><div className="small muted" style={{ marginTop: 3 }}>Hi {profile.name} · NFC tap</div></div></div>
            {myActive || nfcDept ? (
              <div className="modal-b">
                <p className="muted" style={{ fontSize: 14 }}>{myActive ? "You've been on shift since " + fmtTime(myActive.clockIn) + " (" + fmtDur(entryStats(myActive).worked) + " worked)." : "It's " + now.toLocaleTimeString("en-AU", { timeZone: SYD, hour: "numeric", minute: "2-digit" }) + " in Sydney."}</p>
              </div>
            ) : (
              <ul className="dept-list">{DEPTS.map((d) => <li key={d.id} onClick={() => doClockIn(d.id)}><d.Icon size={18} style={{ color: "var(--red)" }} />{d.label}</li>)}</ul>
            )}
            <div className="modal-f">
              <button className="btn btn-o" onClick={finishNfc}>Cancel</button>
              {myActive ? <button className="btn btn-d" onClick={startClockOut}><LogOut size={14} /> Clock out</button> : null}
              {!myActive && nfcDept ? <button className="btn btn-p" onClick={() => doClockIn(nfcDept.id)}><LogIn size={14} /> Clock in</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Department picker */}
      {showDepts ? (
        <div className="overlay" onClick={() => setShowDepts(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div className="modal-t">Where are you working today?</div><button className="btn btn-g btn-sm" onClick={() => setShowDepts(false)}><X size={16} /></button></div>
            <ul className="dept-list">{DEPTS.map((d) => <li key={d.id} onClick={() => doClockIn(d.id)}><d.Icon size={18} style={{ color: "var(--red)" }} />{d.label}</li>)}</ul>
          </div>
        </div>
      ) : null}

      {/* Clock-out: log forgotten breaks */}
      {showRetro ? (
        <div className="overlay">
          <div className="modal">
            <div className="modal-h"><div><div className="modal-t">Any breaks you forgot to log?</div><div className="small muted" style={{ marginTop: 3 }}>Just type how many minutes — no need for exact times.</div></div></div>
            <div className="modal-b">
              {retroRows.map((r, i) => (
                <div key={i} className="row gap8 mb12">
                  <select className="finp" style={{ flex: "0 0 110px" }} value={r.type} onChange={(e) => setRetroRows((p) => p.map((x, idx) => idx === i ? Object.assign({}, x, { type: e.target.value }) : x))}>
                    <option value="rest">Rest</option><option value="meal">Meal</option>
                  </select>
                  <input className="finp" type="number" inputMode="numeric" min="1" max="480" placeholder="Minutes, e.g. 45" value={r.minutes} onChange={(e) => setRetroRows((p) => p.map((x, idx) => idx === i ? Object.assign({}, x, { minutes: e.target.value }) : x))} />
                  <button className="btn btn-g btn-sm" onClick={() => setRetroRows((p) => p.filter((_, idx) => idx !== i))}><X size={14} /></button>
                </div>
              ))}
              <button className="btn btn-o btn-sm" onClick={() => setRetroRows((p) => p.concat([{ type: "rest", minutes: "" }]))}><Plus size={13} /> Add a break</button>
            </div>
            <div className="modal-f">
              <button className="btn btn-g" onClick={() => { setShowRetro(false); finishNfc(); }}>Cancel</button>
              <button className="btn btn-d" onClick={finaliseClockOut}><LogOut size={14} /> {retroRows.some((r) => Number(r.minutes) > 0) ? "Save & clock out" : "Clock out"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit entry times */}
      {editingEntry ? (
        <div className="overlay" onClick={() => setEditingEntry(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div><div className="modal-t">Edit times</div><div className="small muted" style={{ marginTop: 3 }}>{editingEntry.staffName} · Sydney time · past times only</div></div><button className="btn btn-g btn-sm" onClick={() => setEditingEntry(null)}><X size={16} /></button></div>
            <div className="modal-b">
              <div className="fg"><label className="flbl">Clock in</label><input className="finp" type="datetime-local" value={eeIn} max={isoToSydInput(new Date().toISOString())} onChange={(e) => setEeIn(e.target.value)} /></div>
              <div className="fg"><label className="flbl">Clock out</label><input className="finp" type="datetime-local" value={eeOut} max={isoToSydInput(new Date().toISOString())} onChange={(e) => setEeOut(e.target.value)} /></div>
              <div className="fg"><label className="flbl">Note (why it was changed)</label><textarea className="finp" rows={2} value={eeNote} onChange={(e) => setEeNote(e.target.value)} /></div>
            </div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setEditingEntry(null)}>Cancel</button><button className="btn btn-p" onClick={doSaveEdit}><Check size={14} /> Save</button></div>
          </div>
        </div>
      ) : null}

      {/* Edit breaks */}
      {breakEdit ? (
        <div className="overlay" onClick={() => setBreakEdit(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div><div className="modal-t">Edit breaks</div><div className="small muted" style={{ marginTop: 3 }}>{breakEdit.entry.staffName} · {fmtDateShort(breakEdit.entry.clockIn)} · Sydney time</div></div><button className="btn btn-g btn-sm" onClick={() => setBreakEdit(null)}><X size={16} /></button></div>
            <div className="modal-b">
              {breakEdit.rows.length === 0 ? <p className="muted mb12" style={{ fontSize: 13, fontStyle: "italic" }}>No breaks on this shift.</p> : null}
              {breakEdit.rows.map((r, i) => (
                <div key={i} className="row gap8 mb12 wrap">
                  <select className="finp" style={{ flex: "0 0 100px" }} value={r.type} onChange={(e) => updateBreakRow(i, "type", e.target.value)}><option value="rest">Rest</option><option value="meal">Meal</option></select>
                  <input className="finp" type="number" min="1" max="480" style={{ flex: "0 0 110px" }} placeholder="Minutes" value={r.minutes} onChange={(e) => updateBreakRow(i, "minutes", e.target.value)} />
                  <input className="finp" type="datetime-local" style={{ flex: 1, minWidth: 180 }} value={r.startInput} onChange={(e) => updateBreakRow(i, "startInput", e.target.value)} />
                  <button className="btn btn-g btn-sm" onClick={() => setBreakEdit((p) => ({ entry: p.entry, rows: p.rows.filter((_, idx) => idx !== i) }))}><X size={14} /></button>
                </div>
              ))}
              <button className="btn btn-o btn-sm" onClick={() => setBreakEdit((p) => ({ entry: p.entry, rows: p.rows.concat([{ type: "rest", minutes: "", startInput: "" }]) }))}><Plus size={13} /> Add a break</button>
              <p className="small muted" style={{ marginTop: 12 }}>Leave the start time empty and the break is placed in the middle of the shift.</p>
            </div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setBreakEdit(null)}>Cancel</button><button className="btn btn-p" onClick={doSaveBreaks}><Check size={14} /> Save breaks</button></div>
          </div>
        </div>
      ) : null}

      {/* Delete entry */}
      {deleteConfirm ? (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div className="modal-t">Delete this shift?</div></div>
            <div className="modal-b"><p className="muted" style={{ fontSize: 14 }}>{deleteConfirm.staffName}'s shift on {fmtDateShort(deleteConfirm.clockIn)} will be removed permanently.</p></div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setDeleteConfirm(null)}>Cancel</button><button className="btn btn-d" onClick={() => doDeleteEntry(deleteConfirm.id)}><Trash2 size={14} /> Delete</button></div>
          </div>
        </div>
      ) : null}

      {/* Add one person */}
      {showAddStaff ? (
        <div className="overlay" onClick={() => setShowAddStaff(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div className="modal-t">Add a person</div><button className="btn btn-g btn-sm" onClick={() => setShowAddStaff(false)}><X size={16} /></button></div>
            <div className="modal-b">
              <div className="fg"><label className="flbl">Name</label><input className="finp" value={nsName} onChange={(e) => setNsName(e.target.value)} placeholder="e.g. Helena" /></div>
              <div className="fg"><label className="flbl">Email (this is their login)</label><input className="finp" type="email" value={nsEmail} onChange={(e) => setNsEmail(e.target.value)} placeholder="name@example.com" /></div>
              <div className="fg"><label className="flbl">Temporary password</label>
                <div className="row gap8"><input className="finp mono" value={nsPass} onChange={(e) => setNsPass(e.target.value)} /><button className="btn btn-o" onClick={() => setNsPass(genPassword())}><RefreshCw size={13} /></button></div></div>
              <div className="fg"><label className="flbl">Role</label><select className="finp" value={nsRole} onChange={(e) => setNsRole(e.target.value)}><option value="staff">Team member</option><option value="admin">Admin</option></select></div>
            </div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setShowAddStaff(false)}>Cancel</button><button className="btn btn-p" disabled={nsBusy} onClick={doAddStaff}><UserPlus size={14} /> {nsBusy ? "Creating…" : "Create login"}</button></div>
          </div>
        </div>
      ) : null}

      {/* Set up the whole team */}
      {showBulk ? (
        <div className="overlay" onClick={() => { if (!bulkBusy) setShowBulk(false); }}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div><div className="modal-t">Set up the team</div><div className="small muted" style={{ marginTop: 3 }}>Enter each person's email. Rows left blank are skipped. A temporary password is generated for everyone.</div></div></div>
            <div className="modal-b">
              {bulkRows.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>Everyone on the list already has a login.</p> : null}
              {bulkRows.map((r, i) => (
                <div key={r.name} className="row gap8 mb12">
                  <div className="strong" style={{ flex: "0 0 70px" }}>{r.name}</div>
                  <input className="finp" type="email" placeholder={r.name.toLowerCase() + "@…"} value={r.email} onChange={(e) => setBulkRows((p) => p.map((x, idx) => idx === i ? Object.assign({}, x, { email: e.target.value }) : x))} />
                </div>
              ))}
            </div>
            <div className="modal-f"><button className="btn btn-o" disabled={bulkBusy} onClick={() => setShowBulk(false)}>Cancel</button><button className="btn btn-p" disabled={bulkBusy || bulkRows.length === 0} onClick={doBulk}><Users size={14} /> {bulkBusy ? "Creating logins…" : "Create logins"}</button></div>
          </div>
        </div>
      ) : null}

      {/* Credentials to hand out */}
      {credList ? (
        <div className="overlay">
          <div className="modal wide">
            <div className="modal-h"><div><div className="modal-t">Logins created</div><div className="small muted" style={{ marginTop: 3 }}>Share each person's password privately. They can change it under Profile, or use "Forgot password" on the login screen. This list is not saved anywhere, so copy it now.</div></div></div>
            <div className="modal-b">
              <div className="tbl-wrap"><table>
                <thead><tr><th>Name</th><th>Email</th><th>Temporary password</th><th>Result</th></tr></thead>
                <tbody>{credList.map((c, i) => <tr key={i}><td className="strong">{c.name}</td><td>{c.email}</td><td className="mono">{c.password || "—"}</td><td>{c.status === "Created" ? <span className="badge b-green">Created</span> : <span className="small" style={{ color: "var(--red)" }}>{c.status}</span>}</td></tr>)}</tbody>
              </table></div>
              <p className="small muted" style={{ marginTop: 12 }}>Sign-in page: {APP_URL}</p>
            </div>
            <div className="modal-f">
              <button className="btn btn-o" onClick={() => copyText("The Food Farm Time Ledger – " + APP_URL + "\n\n" + credList.filter((c) => c.status === "Created").map((c) => c.name + ": " + c.email + " / " + c.password).join("\n"))}><Copy size={13} /> Copy all</button>
              <button className="btn btn-o" onClick={() => downloadCSV("foodfarm-logins.csv", [["Name", "Email", "Temporary password", "Result"]].concat(credList.map((c) => [c.name, c.email, c.password, c.status])))}><Download size={13} /> Download</button>
              <button className="btn btn-p" onClick={() => setCredList(null)}>Done</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit staff name */}
      {editStaff ? (
        <div className="overlay" onClick={() => setEditStaff(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div className="modal-t">Edit name</div><button className="btn btn-g btn-sm" onClick={() => setEditStaff(null)}><X size={16} /></button></div>
            <div className="modal-b"><div className="fg"><label className="flbl">Name</label><input className="finp" value={esName} onChange={(e) => setEsName(e.target.value)} /></div></div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setEditStaff(null)}>Cancel</button><button className="btn btn-p" onClick={doSaveStaffName}><Check size={14} /> Save</button></div>
          </div>
        </div>
      ) : null}

      {/* Add roster shift */}
      {showAddRoster ? (
        <div className="overlay" onClick={() => setShowAddRoster(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div className="modal-t">Add roster shift</div><button className="btn btn-g btn-sm" onClick={() => setShowAddRoster(false)}><X size={16} /></button></div>
            <div className="modal-b">
              <div className="fg"><label className="flbl">Team member</label><select className="finp" value={frStaff} onChange={(e) => setFrStaff(e.target.value)}><option value="">Select…</option>{activeTeam.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="fg"><label className="flbl">Date</label><input className="finp" type="date" value={frDate} onChange={(e) => setFrDate(e.target.value)} /></div>
              <div className="row gap12">
                <div className="fg" style={{ flex: 1 }}><label className="flbl">Start time</label><input className="finp" type="time" value={frStart} onChange={(e) => setFrStart(e.target.value)} /></div>
                <div className="fg" style={{ flex: 1 }}><label className="flbl">End time (optional)</label><input className="finp" type="time" value={frEnd} onChange={(e) => setFrEnd(e.target.value)} /></div>
              </div>
            </div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setShowAddRoster(false)}>Cancel</button><button className="btn btn-p" onClick={doAddShift}><Plus size={14} /> Add shift</button></div>
          </div>
        </div>
      ) : null}

      {/* Request leave */}
      {showLeaveForm ? (
        <div className="overlay" onClick={() => setShowLeaveForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div><div className="modal-t">Request leave</div><div className="small muted" style={{ marginTop: 3 }}>For {profile.name}</div></div><button className="btn btn-g btn-sm" onClick={() => setShowLeaveForm(false)}><X size={16} /></button></div>
            <div className="modal-b">
              <div className="fg"><label className="flbl">Type</label><select className="finp" value={flType} onChange={(e) => setFlType(e.target.value)}><option value="annual">Annual leave</option><option value="sick">Sick leave</option><option value="personal">Personal leave</option><option value="unpaid">Unpaid leave</option><option value="other">Other</option></select></div>
              <div className="row gap12">
                <div className="fg" style={{ flex: 1 }}><label className="flbl">From</label><input className="finp" type="date" value={flFrom} onChange={(e) => setFlFrom(e.target.value)} /></div>
                <div className="fg" style={{ flex: 1 }}><label className="flbl">To</label><input className="finp" type="date" value={flTo} onChange={(e) => setFlTo(e.target.value)} /></div>
              </div>
              <div className="fg"><label className="flbl">Note (optional)</label><textarea className="finp" rows={2} value={flNote} onChange={(e) => setFlNote(e.target.value)} /></div>
              <div className="small" style={{ background: "var(--bluebg)", color: "var(--blue)", borderRadius: "var(--rs)", padding: "9px 12px" }}>Your request is saved in the app for Hannah, and your email app will open with a message ready to send.</div>
            </div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setShowLeaveForm(false)}>Cancel</button><button className="btn btn-p" onClick={doSubmitLeave}><Send size={14} /> Send request</button></div>
          </div>
        </div>
      ) : null}

      {/* Change password */}
      {showPw ? (
        <div className="overlay" onClick={() => setShowPw(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><div className="modal-t">Change password</div><button className="btn btn-g btn-sm" onClick={() => setShowPw(false)}><X size={16} /></button></div>
            <div className="modal-b">
              <div className="fg"><label className="flbl">Current password</label><input className="finp" type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} /></div>
              <div className="fg"><label className="flbl">New password</label><input className="finp" type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} /></div>
              <div className="fg"><label className="flbl">Repeat new password</label><input className="finp" type="password" autoComplete="new-password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} /></div>
            </div>
            <div className="modal-f"><button className="btn btn-o" onClick={() => setShowPw(false)}>Cancel</button><button className="btn btn-p" disabled={pwBusy} onClick={doChangePassword}><Lock size={14} /> {pwBusy ? "Saving…" : "Update password"}</button></div>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className={"toast toast-" + toast.type}>
          {toast.type === "ok" ? <CheckCircle2 size={15} /> : toast.type === "err" ? <AlertCircle size={15} /> : <Bell size={15} />}
          {toast.msg}
        </div>
      ) : null}

      {/* Bottom nav (phones) */}
      <nav className="bottom-nav">
        {NAV_FLAT.map((it) => (
          <button key={it.id} className={view === it.id ? "bnav-btn active" : "bnav-btn"} onClick={() => setView(it.id)}>
            <it.Icon size={20} />{it.short}
          </button>
        ))}
      </nav>
    </div>
  );
}
