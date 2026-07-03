
import { useState, useEffect, useRef } from "react";
import {
  Clock, MapPin, Coffee, LogIn, LogOut, Users, Download, Plus, X,
  AlertCircle, CheckCircle2, History, UserPlus, Calendar, ChevronLeft,
  ChevronRight, Edit2, Building2, Bell, Send, Check, Utensils,
  Briefcase, Truck, Package, Tractor, RefreshCw, Mail, Egg, BarChart2
} from "lucide-react";

// ─── Simple localStorage helpers ─────────────────────────────────────────────
const LS = {
  get: (key, def) => {
    try { const v = localStorage.getItem("ff_" + key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set: (key, val) => {
    try { localStorage.setItem("ff_" + key, JSON.stringify(val)); } catch {}
  },
};

// ─── NSW Public Holidays 2025-2026 ────────────────────────────────────────────
const HOLIDAYS = {
  "2025-01-01":"New Year's Day","2025-01-27":"Australia Day (obs.)",
  "2025-04-18":"Good Friday","2025-04-19":"Easter Saturday","2025-04-20":"Easter Sunday","2025-04-21":"Easter Monday",
  "2025-04-25":"ANZAC Day","2025-06-09":"King's Birthday","2025-08-04":"Bank Holiday",
  "2025-10-06":"Labour Day","2025-12-25":"Christmas Day","2025-12-26":"Boxing Day",
  "2026-01-01":"New Year's Day","2026-01-26":"Australia Day",
  "2026-04-03":"Good Friday","2026-04-04":"Easter Saturday","2026-04-05":"Easter Sunday","2026-04-06":"Easter Monday",
  "2026-04-25":"ANZAC Day","2026-06-08":"King's Birthday","2026-08-03":"Bank Holiday",
  "2026-10-05":"Labour Day","2026-12-25":"Christmas Day","2026-12-26":"Boxing Day",
};

// ─── Departments ──────────────────────────────────────────────────────────────
const DEPTS = [
  { id:"office",  label:"Office / Admin",            Icon: Briefcase },
  { id:"butchery",label:"Butchery",                  Icon: Package   },
  { id:"farm",    label:"Farm",                       Icon: Tractor   },
  { id:"markets", label:"Markets",                    Icon: Building2 },
  { id:"eggs",    label:"Egg Cleaning & Packing",     Icon: Egg       },
  { id:"deliver", label:"Deliveries",                 Icon: Truck     },
];

const MANAGER = "hannahgreenshields@gmail.com";

// ─── Time helpers (Sydney) ────────────────────────────────────────────────────
const SYD = "Australia/Sydney";
const sydNow   = () => new Date(new Date().toLocaleString("en-US", { timeZone: SYD }));
const sydKey   = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: SYD }); // YYYY-MM-DD
const sydDOW   = (iso) => new Date(new Date(iso).toLocaleString("en-US", { timeZone: SYD })).getDay();
const fmtTime  = (iso) => new Date(iso).toLocaleTimeString("en-AU", { timeZone: SYD, hour:"2-digit", minute:"2-digit" });
const fmtDate  = (iso) => new Date(iso).toLocaleDateString("en-AU", { timeZone: SYD, weekday:"short", day:"numeric", month:"short" });
const fmtDur   = (ms) => { if (!ms || ms < 0) ms = 0; return Math.floor(ms/3600000) + "h " + Math.floor((ms%3600000)/60000) + "m"; };

// ─── Break pay logic ──────────────────────────────────────────────────────────
// Meal:  0-30 min = unpaid | 30-50 min = paid (up to 20 min) | >50 min = unpaid again
// Rest:  0-20 min = paid   | >20 min = unpaid
const breakUnpaidMs = (b) => {
  const ms  = b.end ? new Date(b.end) - new Date(b.start) : sydNow() - new Date(b.start);
  const min = ms / 60000;
  if (b.type === "meal") {
    if (min <= 30) return ms;                        // all unpaid
    if (min <= 50) return 30 * 60000;               // 30 min unpaid, rest paid
    return (30 + (min - 50)) * 60000;               // 30 + overtime unpaid
  }
  return min <= 20 ? 0 : (min - 20) * 60000;        // rest: first 20 paid
};

const workedMs = (e) => {
  const end   = e.clockOut ? new Date(e.clockOut) : sydNow();
  const total = end - new Date(e.clockIn);
  const unpaid = (e.breaks || []).reduce((a, b) => a + breakUnpaidMs(b), 0);
  return Math.max(0, total - unpaid);
};

const breakTotalMs = (e) =>
  (e.breaks || []).reduce((a, b) => {
    const ms = b.end ? new Date(b.end) - new Date(b.start) : sydNow() - new Date(b.start);
    return a + ms;
  }, 0);

// ─── Email helper ─────────────────────────────────────────────────────────────
const mailto = (to, subject, body) =>
  window.open("mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body), "_blank");

// ─── Haversine ────────────────────────────────────────────────────────────────
const haversine = (la1, lo1, la2, lo2) => {
  const R = 6371000, r = x => x * Math.PI / 180;
  const a = Math.sin(r(la2-la1)/2)**2 + Math.cos(r(la1))*Math.cos(r(la2))*Math.sin(r(lo2-lo1)/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// ─── Calendar helper ──────────────────────────────────────────────────────────
const daysInMonth = (y, m) => new Date(y, m+1, 0).getDate();
const firstDOW    = (y, m) => new Date(y, m, 1).getDay();

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [staff,     setStaff    ] = useState(() => LS.get("staff",   []));
  const [entries,   setEntries  ] = useState(() => LS.get("entries", []));
  const [roster,    setRoster   ] = useState(() => LS.get("roster",  []));
  const [leaves,    setLeaves   ] = useState(() => LS.get("leaves",  []));
  const [farmLoc,   setFarmLoc  ] = useState(() => LS.get("loc",     null));
  const [view,      setView     ] = useState("clock");
  const [now,       setNow      ] = useState(sydNow());
  const [toast,     setToast    ] = useState(null);

  // clock-in flow
  const [pin,       setPin      ] = useState("");
  const [selStaff,  setSelStaff ] = useState(null);
  const [showDepts, setShowDepts] = useState(false);

  // modals
  const [showAddStaff,   setShowAddStaff  ] = useState(false);
  const [showAddRoster,  setShowAddRoster ] = useState(false);
  const [showLeaveForm,  setShowLeaveForm ] = useState(false);
  const [editingEntry,   setEditingEntry  ] = useState(null);

  // add-staff form
  const [fsName, setFsName] = useState("");
  const [fsPin,  setFsPin ] = useState("");
  const [fsRole, setFsRole] = useState("staff");

  // roster form
  const [frStaff, setFrStaff] = useState("");
  const [frDate,  setFrDate ] = useState("");
  const [frStart, setFrStart] = useState("");
  const [frEnd,   setFrEnd  ] = useState("");

  // leave form
  const [flStaff, setFlStaff] = useState("");
  const [flFrom,  setFlFrom ] = useState("");
  const [flTo,    setFlTo   ] = useState("");
  const [flType,  setFlType ] = useState("annual");
  const [flNote,  setFlNote ] = useState("");

  // edit-entry form
  const [eeIn,    setEeIn   ] = useState("");
  const [eeOut,   setEeOut  ] = useState("");
  const [eeNote,  setEeNote ] = useState("");

  // calendar month
  const [calMo, setCalMo] = useState(() => { const d = sydNow(); return { y: d.getFullYear(), m: d.getMonth() }; });

  // reports filter
  const [rptRange, setRptRange] = useState("thisWeek"); // thisWeek | lastWeek | thisMonth | lastMonth | custom
  const [rptFrom,  setRptFrom ] = useState("");
  const [rptTo,    setRptTo   ] = useState("");

  // ── Persist helpers ────────────────────────────────────────────────────────
  const saveStaff   = (v) => { setStaff(v);   LS.set("staff",   v); };
  const saveEntries = (v) => { setEntries(v); LS.set("entries", v); };
  const saveRoster  = (v) => { setRoster(v);  LS.set("roster",  v); };
  const saveLeaves  = (v) => { setLeaves(v);  LS.set("leaves",  v); };
  const saveLoc     = (v) => { setFarmLoc(v); LS.set("loc",     v); };

  // ── Live clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(sydNow()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Missed clock-in check (every minute) ──────────────────────────────────
  const lastMinRef = useRef(-1);
  useEffect(() => {
    const m = now.getMinutes();
    if (m === lastMinRef.current) return;
    lastMinRef.current = m;
    const todayStr = sydKey(new Date().toISOString());
    const nowMins  = now.getHours() * 60 + now.getMinutes();
    roster.forEach(sh => {
      if (sh.date !== todayStr) return;
      const [h, mn] = sh.startTime.split(":").map(Number);
      const diff = nowMins - (h * 60 + mn);
      if (diff < 15 || diff >= 16) return;
      const s = staff.find(x => x.id === sh.staffId);
      if (!s) return;
      const alreadyIn = entries.some(e => e.staffId === s.id && sydKey(e.clockIn) === todayStr);
      if (!alreadyIn) {
        showToast("⚠️ " + s.name + " hasn't clocked in (rostered " + sh.startTime + ")", "warn");
        if (Notification?.permission === "granted")
          new Notification("Food Farm", { body: s.name + " rostered at " + sh.startTime + " hasn't clocked in." });
      }
    });
  }, [now.getMinutes()]);

  // ── Weekly summary prompt – Monday 8am ────────────────────────────────────
  useEffect(() => {
    if (now.getDay() === 1 && now.getHours() === 8 && now.getMinutes() === 0)
      doWeeklySummary();
  }, [now.getMinutes()]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Lookups ────────────────────────────────────────────────────────────────
  const activeEntry  = sid => entries.find(e => e.staffId === sid && !e.clockOut);
  const currentlyIn  = staff.filter(s => activeEntry(s.id));
  const todayStr     = sydKey(new Date().toISOString());

  const selActive    = selStaff ? activeEntry(selStaff.id) : null;
  const openBreak    = selActive?.breaks.find(b => !b.end);

  // ── GPS check ─────────────────────────────────────────────────────────────
  const checkGPS = () => new Promise(res => {
    if (!farmLoc) { res(true); return; }
    if (!navigator.geolocation) { showToast("Geolocation not supported", "err"); res(false); return; }
    navigator.geolocation.getCurrentPosition(
      p => {
        const d = haversine(p.coords.latitude, p.coords.longitude, farmLoc.lat, farmLoc.lng);
        if (d <= 200) res(true);
        else { showToast(Math.round(d) + "m from farm – too far", "err"); res(false); }
      },
      e => { showToast(e.message || "Location error", "err"); res(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ── PIN pad ────────────────────────────────────────────────────────────────
  const handleDigit = d => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      const found = staff.find(s => s.pin === next);
      if (found) {
        setSelStaff(found);
      } else {
        showToast("PIN not recognised", "err");
        setTimeout(() => setPin(""), 500);
      }
    }
  };

  const cancelPin = () => { setSelStaff(null); setPin(""); setShowDepts(false); };

  // ── Clock actions ──────────────────────────────────────────────────────────
  const doClockIn = async deptId => {
    setShowDepts(false);
    if (!(await checkGPS())) return;
    const entry = {
      id: "e_" + Date.now(),
      staffId:   selStaff.id,
      staffName: selStaff.name,
      department: deptId,
      clockIn:  new Date().toISOString(),
      clockOut: null,
      breaks:   [],
      note:     "",
    };
    saveEntries([entry, ...entries]);
    showToast(selStaff.name + " clocked in – " + (DEPTS.find(d => d.id === deptId)?.label || ""));
    cancelPin();
  };

  const doClockOut = async () => {
    if (!selActive) return;
    if (!(await checkGPS())) return;
    const breaks  = selActive.breaks.map(b => b.end ? b : { ...b, end: new Date().toISOString() });
    const updated = { ...selActive, breaks, clockOut: new Date().toISOString() };
    saveEntries(entries.map(e => e.id === selActive.id ? updated : e));
    showToast(selStaff.name + " clocked out – " + fmtDur(workedMs(updated)));
    cancelPin();
  };

  const doBreak = async type => {
    if (!selActive) return;
    const ob = selActive.breaks.find(b => !b.end);
    const breaks = ob
      ? selActive.breaks.map(b => b === ob ? { ...b, end: new Date().toISOString() } : b)
      : [...selActive.breaks, { type, start: new Date().toISOString(), end: null }];
    saveEntries(entries.map(e => e.id === selActive.id ? { ...selActive, breaks } : e));
    showToast(ob ? "Break ended" : type === "meal" ? "Meal break started" : "Rest break started");
    cancelPin();
  };

  // ── Add staff ──────────────────────────────────────────────────────────────
  const doAddStaff = () => {
    if (!fsName.trim())          { showToast("Please enter a name", "err");            return; }
    if (!/^\d{4}$/.test(fsPin))  { showToast("PIN must be exactly 4 digits", "err");  return; }
    if (staff.some(s => s.pin === fsPin)) { showToast("That PIN is already taken", "err"); return; }
    const s = { id: "s_" + Date.now(), name: fsName.trim(), pin: fsPin, role: fsRole };
    saveStaff([...staff, s]);
    setFsName(""); setFsPin(""); setFsRole("staff");
    setShowAddStaff(false);
    showToast(s.name + " added to the crew");
  };

  // ── Add roster shift ───────────────────────────────────────────────────────
  const doAddShift = () => {
    if (!frStaff || !frDate || !frStart) { showToast("Fill in all required fields", "err"); return; }
    saveRoster([...roster, { id: "r_" + Date.now(), staffId: frStaff, date: frDate, startTime: frStart, endTime: frEnd }]);
    setFrStaff(""); setFrDate(""); setFrStart(""); setFrEnd("");
    setShowAddRoster(false);
    showToast("Shift added");
  };

  // ── Submit leave ───────────────────────────────────────────────────────────
  const doSubmitLeave = () => {
    if (!flStaff || !flFrom || !flTo) { showToast("Fill in all required fields", "err"); return; }
    const sName = staff.find(s => s.id === flStaff)?.name || "";
    const req = { id: "l_" + Date.now(), staffId: flStaff, staffName: sName, from: flFrom, to: flTo, type: flType, note: flNote, status: "pending", submitted: new Date().toISOString() };
    saveLeaves([...leaves, req]);
    mailto(MANAGER, "Leave Request – " + sName,
      "Hi Hannah,\n\n" + sName + " has submitted a " + flType + " leave request.\n\nFrom: " + flFrom + "\nTo:   " + flTo + "\nNote: " + (flNote || "—") + "\n\nPlease review in the Time Ledger app.\n\nThanks");
    setFlStaff(""); setFlFrom(""); setFlTo(""); setFlType("annual"); setFlNote("");
    setShowLeaveForm(false);
    showToast("Leave request submitted");
  };

  // ── Edit entry ─────────────────────────────────────────────────────────────
  const openEdit = e => {
    setEditingEntry(e);
    const pad = n => String(n).padStart(2, "0");
    const toLocal = iso => { if (!iso) return ""; const d = new Date(iso); return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
    setEeIn(toLocal(e.clockIn)); setEeOut(toLocal(e.clockOut)); setEeNote(e.note || "");
  };
  const doSaveEdit = () => {
    saveEntries(entries.map(e => e.id === editingEntry.id
      ? { ...e, clockIn: new Date(eeIn).toISOString(), clockOut: eeOut ? new Date(eeOut).toISOString() : null, note: eeNote }
      : e));
    setEditingEntry(null);
    showToast("Entry updated");
  };

  // ── Weekly summary ─────────────────────────────────────────────────────────
  const doWeeklySummary = () => {
    const d   = sydNow();
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    const wk  = entries.filter(e => { const cd = new Date(e.clockIn); return cd >= mon && cd <= sun; });
    if (!wk.length) { showToast("No hours recorded last week", "warn"); return; }
    let body = "The Food Farm – Weekly Hours\nWeek: " + mon.toLocaleDateString("en-AU") + " – " + sun.toLocaleDateString("en-AU") + "\n\n";
    staff.forEach(s => {
      const se = wk.filter(e => e.staffId === s.id);
      if (!se.length) return;
      const wd  = se.filter(e => { const dow = sydDOW(e.clockIn); return dow >= 1 && dow <= 5; }).reduce((a,e) => a + workedMs(e), 0);
      const sat = se.filter(e => sydDOW(e.clockIn) === 6).reduce((a,e) => a + workedMs(e), 0);
      const sun2= se.filter(e => sydDOW(e.clockIn) === 0).reduce((a,e) => a + workedMs(e), 0);
      body += s.name + ":\n  Mon–Fri:  " + fmtDur(wd) + "\n";
      if (sat)  body += "  Saturday: " + fmtDur(sat) + "\n";
      if (sun2) body += "  Sunday:   " + fmtDur(sun2) + "\n";
      body += "\n";
    });
    mailto(MANAGER, "The Food Farm – Weekly Hours Summary", body);
  };

  // ── GPS pin ────────────────────────────────────────────────────────────────
  const pinLocation = () => {
    if (!navigator.geolocation) { showToast("Geolocation not supported", "err"); return; }
    navigator.geolocation.getCurrentPosition(
      p => { saveLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); showToast("Farm location saved"); },
      e => showToast(e.message || "Location error", "err"),
      { enableHighAccuracy: true }
    );
  };

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [["Staff","Department","Date","In","Out","Break","Worked (h)","Status","Note"]];
    [...entries].sort((a,b) => new Date(b.clockIn)-new Date(a.clockIn)).forEach(e => {
      rows.push([e.staffName, DEPTS.find(d=>d.id===e.department)?.label||"", fmtDate(e.clockIn), fmtTime(e.clockIn),
        e.clockOut ? fmtTime(e.clockOut) : "", fmtDur(breakTotalMs(e)),
        (workedMs(e)/3600000).toFixed(2), e.clockOut?"Closed":"Active", e.note||""]);
    });
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = "foodfarm-" + todayStr + ".csv";
    a.click();
    showToast("CSV exported");
  };

  // ── Report date range resolver ─────────────────────────────────────────────
  const rptDates = () => {
    const d = sydNow();
    const monday = (base) => { const x = new Date(base); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0,0,0,0); return x; };
    if (rptRange === "thisWeek") {
      const from = monday(d); const to = new Date(); to.setHours(23,59,59,999);
      return { from, to };
    }
    if (rptRange === "lastWeek") {
      const from = monday(d); from.setDate(from.getDate() - 7);
      const to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59,999);
      return { from, to };
    }
    if (rptRange === "thisMonth") {
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to   = new Date(); to.setHours(23,59,59,999);
      return { from, to };
    }
    if (rptRange === "lastMonth") {
      const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const to   = new Date(d.getFullYear(), d.getMonth(), 0); to.setHours(23,59,59,999);
      return { from, to };
    }
    // custom
    const from = rptFrom ? new Date(rptFrom) : new Date(0);
    const to   = rptTo   ? new Date(rptTo + "T23:59:59") : new Date();
    return { from, to };
  };

  const rptEntries = () => {
    const { from, to } = rptDates();
    return entries.filter(e => { const d = new Date(e.clockIn); return d >= from && d <= to && e.clockOut; });
  };

  // Hours per department (for bar chart)
  const deptReport = () => {
    const filtered = rptEntries();
    const total    = filtered.reduce((a, e) => a + workedMs(e), 0);
    return DEPTS.map(dep => {
      const ms   = filtered.filter(e => e.department === dep.id).reduce((a, e) => a + workedMs(e), 0);
      const pct  = total > 0 ? (ms / total) * 100 : 0;
      const hrs  = ms / 3600000;
      return { ...dep, ms, hrs, pct };
    }).sort((a, b) => b.ms - a.ms);
  };

  // Hours per staff member (for bar chart)
  const staffReport = () => {
    const filtered = rptEntries();
    const total    = filtered.reduce((a, e) => a + workedMs(e), 0);
    return staff.map(s => {
      const ms  = filtered.filter(e => e.staffId === s.id).reduce((a, e) => a + workedMs(e), 0);
      const pct = total > 0 ? (ms / total) * 100 : 0;
      return { ...s, ms, hrs: ms / 3600000, pct };
    }).sort((a, b) => b.ms - a.ms);
  };

  // Daily trend (last 7 or 14 days based on range)
  const dailyTrend = () => {
    const { from, to } = rptDates();
    const days = [];
    const cur  = new Date(from); cur.setHours(0,0,0,0);
    while (cur <= to) {
      const key  = cur.toLocaleDateString("en-CA");
      const dEnd = new Date(cur); dEnd.setHours(23,59,59,999);
      const ms   = entries.filter(e => {
        const d = new Date(e.clockIn);
        return d >= cur && d <= dEnd && e.clockOut;
      }).reduce((a, e) => a + workedMs(e), 0);
      days.push({ label: cur.toLocaleDateString("en-AU", { weekday:"short", day:"numeric", month:"short" }), ms, hrs: ms / 3600000 });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  };

  const DEPT_COLORS = ["#2d5a3d","#3a7050","#b8720f","#8c3820","#1a4a8c","#6b5d4f"];

  // ════════════════════════════════════════════════════════════════════════════
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #f0e9da; --surface: #faf6ee; --bdr: #d4c9b3;
      --ink: #1e1710; --ink2: #6b5d4f; --ink3: #a8977f;
      --green: #2d5a3d; --greenh: #3a7050; --greenbg: #e4ede7;
      --red: #8c3820; --redh: #b04828; --redbg: #f5e5e0;
      --amber: #b8720f; --amberbg: #fdf0d8;
      --blue: #1a4a8c; --bluebg: #e4ecf8;
      --serif: 'DM Serif Display', Georgia, serif;
      --sans:  'DM Sans', system-ui, sans-serif;
      --mono:  'DM Mono', monospace;
      --r: 10px; --rs: 7px;
      --sh: 0 1px 3px rgba(0,0,0,.07), 0 4px 14px rgba(0,0,0,.05);
      --shl: 0 4px 24px rgba(0,0,0,.13), 0 12px 40px rgba(0,0,0,.10);
    }
    body { font-family: var(--sans); background: var(--bg); color: var(--ink); }
    input, select, textarea, button { font-family: var(--sans); }

    /* Layout */
    .app   { display: flex; min-height: 100vh; }
    .sidebar {
      width: 220px; flex-shrink: 0; background: var(--ink); color: #fff;
      display: flex; flex-direction: column;
      position: sticky; top: 0; height: 100vh; overflow-y: auto;
    }
    .sb-logo   { padding: 22px 18px 16px; border-bottom: 1px solid rgba(255,255,255,.1); }
    .sb-title  { font-family: var(--serif); font-size: 17px; line-height: 1.2; }
    .sb-sub    { font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.35); margin-top: 3px; font-family: var(--mono); }
    .sb-nav    { flex: 1; padding: 10px 0; }
    .sb-sec    { font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.28); padding: 14px 18px 5px; font-family: var(--mono); }
    .nav-btn   { display: flex; align-items: center; gap: 10px; padding: 9px 18px; font-size: 13px; font-weight: 500; color: rgba(255,255,255,.55); cursor: pointer; border: none; background: none; width: 100%; text-align: left; transition: all .15s; }
    .nav-btn:hover { background: rgba(255,255,255,.07); color: #fff; }
    .nav-btn.active { background: rgba(255,255,255,.11); color: #fff; border-left: 3px solid #c4a96a; }
    .sb-foot   { padding: 14px 18px; border-top: 1px solid rgba(255,255,255,.1); font-size: 11px; color: rgba(255,255,255,.28); }

    .main    { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
    .topbar  { background: var(--surface); border-bottom: 1px solid var(--bdr); padding: 0 28px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
    .tb-t    { font-family: var(--serif); font-size: 20px; }
    .tb-c    { font-family: var(--mono); font-size: 12px; color: var(--ink2); }
    .page    { padding: 24px 28px; }

    /* Cards */
    .card    { background: var(--surface); border: 1px solid var(--bdr); border-radius: var(--r); box-shadow: var(--sh); }
    .card-h  { padding: 15px 18px 12px; border-bottom: 1px solid var(--bdr); }
    .card-b  { padding: 18px; }
    .card-t  { font-family: var(--serif); font-size: 17px; }

    /* Grid / flex helpers */
    .g2  { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .g3  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .row { display: flex; align-items: center; }
    .col { display: flex; flex-direction: column; }
    .gap4  { gap: 4px; }  .gap8  { gap: 8px; }
    .gap12 { gap: 12px; } .gap16 { gap: 16px; }
    .between { justify-content: space-between; }
    .wrap    { flex-wrap: wrap; }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: var(--rs); font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all .15s; white-space: nowrap; }
    .btn:active { transform: translateY(1px); }
    .btn:disabled { opacity: .35; cursor: not-allowed; transform: none; }
    .btn-p  { background: var(--green); color: #fff; } .btn-p:hover  { background: var(--greenh); }
    .btn-d  { background: var(--red);   color: #fff; } .btn-d:hover  { background: var(--redh); }
    .btn-a  { background: var(--amber); color: #fff; } .btn-a:hover  { background: #9d6008; }
    .btn-o  { background: transparent; color: var(--ink); border: 1.5px solid var(--bdr); } .btn-o:hover { border-color: var(--ink3); background: var(--bg); }
    .btn-g  { background: transparent; color: var(--ink2); } .btn-g:hover { background: var(--bg); }
    .btn-sm { padding: 6px 11px; font-size: 12px; }
    .btn-lg { padding: 13px 20px; font-size: 15px; width: 100%; justify-content: center; }

    /* Badges */
    .badge   { display: inline-flex; align-items: center; gap: 3px; padding: 3px 9px; border-radius: 100px; font-size: 11px; font-weight: 500; font-family: var(--mono); }
    .b-green { background: var(--greenbg); color: var(--green); }
    .b-red   { background: var(--redbg);   color: var(--red);   }
    .b-amber { background: var(--amberbg); color: var(--amber); }
    .b-blue  { background: var(--bluebg);  color: var(--blue);  }
    .b-gray  { background: var(--bg);      color: var(--ink2);  }

    /* PIN pad */
    .pinpad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; max-width: 252px; margin: 0 auto; }
    .pin-key { aspect-ratio: 1; border: 1.5px solid var(--bdr); border-radius: var(--rs); background: var(--bg); font-family: var(--serif); font-size: 24px; cursor: pointer; transition: all .1s; display: flex; align-items: center; justify-content: center; color: var(--ink); }
    .pin-key:hover  { background: var(--surface); border-color: var(--ink3); }
    .pin-key:active { transform: scale(.93); }
    .pin-key:disabled { opacity: .3; cursor: not-allowed; }
    .pin-dots { display: flex; gap: 10px; justify-content: center; margin: 16px 0; }
    .pin-dot  { width: 13px; height: 13px; border-radius: 50%; border: 2px solid var(--bdr); transition: all .15s; }
    .pin-dot.on { background: var(--green); border-color: var(--green); }

    /* Table */
    .tbl-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 9px 13px; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; font-family: var(--mono); font-weight: 500; color: var(--ink2); border-bottom: 1.5px solid var(--bdr); }
    td { padding: 11px 13px; border-bottom: 1px solid var(--bdr); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg); }

    /* Calendar */
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
    .cal-dh   { font-size: 10px; font-family: var(--mono); text-align: center; color: var(--ink3); padding: 5px 0; }
    .cal-day  { min-height: 68px; border: 1px solid var(--bdr); border-radius: var(--rs); padding: 5px; background: var(--surface); }
    .cal-day.today { border-color: var(--green); background: var(--greenbg); }
    .cal-day.hol   { background: var(--redbg); border-color: var(--red); }
    .cal-day.empty { background: transparent; border: none; }
    .cal-num  { font-weight: 600; font-family: var(--mono); font-size: 12px; }
    .cal-chip { font-size: 9px; margin-top: 2px; line-height: 1.3; border-radius: 3px; padding: 1px 3px; }

    /* Modal */
    .overlay { position: fixed; inset: 0; background: rgba(30,23,16,.55); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .modal   { background: var(--surface); border-radius: var(--r); box-shadow: var(--shl); width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; }
    .modal-h { padding: 18px 22px 14px; border-bottom: 1px solid var(--bdr); display: flex; align-items: center; justify-content: space-between; }
    .modal-t { font-family: var(--serif); font-size: 19px; }
    .modal-b { padding: 18px 22px; }
    .modal-f { padding: 14px 22px; border-top: 1px solid var(--bdr); display: flex; gap: 9px; justify-content: flex-end; }

    /* Form */
    .fg   { margin-bottom: 14px; }
    .flbl { font-size: 12px; font-weight: 500; margin-bottom: 5px; display: block; color: var(--ink2); }
    .finp { width: 100%; padding: 9px 11px; border: 1.5px solid var(--bdr); border-radius: var(--rs); font-size: 13px; background: var(--bg); color: var(--ink); outline: none; transition: border .15s; }
    .finp:focus { border-color: var(--green); }
    select.finp { appearance: auto; }

    /* Dept list */
    .dept-list    { list-style: none; }
    .dept-list li { padding: 12px 18px; border-bottom: 1px solid var(--bdr); cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 14px; transition: all .1s; }
    .dept-list li:hover { background: var(--greenbg); color: var(--green); }
    .dept-list li:last-child { border-bottom: none; }

    /* Toast */
    .toast      { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 999; padding: 11px 18px; border-radius: var(--rs); display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 500; box-shadow: var(--shl); animation: tup .22s ease-out; white-space: nowrap; }
    .toast-ok   { background: var(--ink);   color: #fff; }
    .toast-err  { background: var(--red);   color: #fff; }
    .toast-warn { background: var(--amber); color: #fff; }
    @keyframes tup { from { transform: translateX(-50%) translateY(10px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; } }

    /* Report charts */
    .stat-bar-bg { background: var(--bdr); border-radius: 100px; overflow: hidden; height: 10px; flex: 1; }
    .stat-bar-fill { height: 100%; border-radius: 100px; transition: width .5s ease; }
    .stat-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--bdr); }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { font-size: 13px; font-weight: 500; min-width: 160px; display: flex; align-items: center; gap: 8px; }
    .stat-val { font-family: var(--mono); font-size: 12px; color: var(--ink2); min-width: 60px; text-align: right; }
    .stat-pct { font-family: var(--mono); font-size: 11px; color: var(--ink3); min-width: 38px; text-align: right; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
    .kpi { background: var(--surface); border: 1px solid var(--bdr); border-radius: var(--r); padding: 16px 18px; box-shadow: var(--sh); }
    .kpi-val { font-family: var(--serif); font-size: 28px; line-height: 1; margin-bottom: 4px; }
    .kpi-lbl { font-size: 11px; color: var(--ink2); letter-spacing: .05em; text-transform: uppercase; font-family: var(--mono); }
    .trend-bar { display: flex; align-items: flex-end; gap: 4px; height: 100px; }
    .trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .trend-fill { width: 100%; border-radius: 4px 4px 0 0; transition: height .4s ease; min-height: 2px; }
    .trend-lbl { font-size: 9px; font-family: var(--mono); color: var(--ink3); text-align: center; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
    .rpt-filter { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .filter-btn { padding: 6px 13px; border-radius: 100px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1.5px solid var(--bdr); background: transparent; color: var(--ink2); transition: all .15s; }
    .filter-btn.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    @media (max-width: 768px) { .kpi-grid { grid-template-columns: 1fr 1fr; } }
  `;

  const NAV = [
    { sec: "Time",     items: [{ id:"clock",      label:"Clock In / Out" }, { id:"timesheets", label:"Timesheets" }] },
    { sec: "Planning", items: [{ id:"roster",     label:"Roster"         }, { id:"leave",      label:"Leave"      }] },
    { sec: "Insights", items: [{ id:"reports",    label:"Reports"        }] },
    { sec: "Admin",    items: [{ id:"staff",      label:"Staff"          }, { id:"settings",   label:"Settings"   }] },
  ];

  const pageLabel = NAV.flatMap(g => g.items).find(n => n.id === view)?.label || "";

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="app">
      <style>{css}</style>

      {/* ─── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sb-logo">
          <div className="sb-title">The Food Farm</div>
          <div className="sb-sub">Time Ledger</div>
        </div>
        <nav className="sb-nav">
          {NAV.map(({ sec, items }) => (
            <div key={sec}>
              <div className="sb-sec">{sec}</div>
              {items.map(({ id, label }) => {
                const cls = (view === id) ? "nav-btn active" : "nav-btn";
                return (
                  <button key={id} className={cls} onClick={() => setView(id)}>
                    {id === "clock"      && <Clock size={15} />}
                    {id === "timesheets" && <History size={15} />}
                    {id === "roster"     && <Calendar size={15} />}
                    {id === "leave"      && <Calendar size={15} />}
                    {id === "reports"    && <BarChart2 size={15} />}
                    {id === "staff"      && <Users size={15} />}
                    {id === "settings"   && <MapPin size={15} />}
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          {now.toLocaleDateString("en-AU", { timeZone: SYD, weekday:"short", day:"numeric", month:"short" })} · Sydney
        </div>
      </aside>

      {/* ─── MAIN ─────────────────────────────────────────────────────────── */}
      <div className="main">
        <div className="topbar">
          <div className="tb-t">{pageLabel}</div>
          <div className="tb-c">{now.toLocaleTimeString("en-AU", { timeZone: SYD, hour:"2-digit", minute:"2-digit", second:"2-digit" })} AEDT</div>
        </div>

        {/* ══ CLOCK ══════════════════════════════════════════════════════════ */}
        {view === "clock" && (
          <div className="page">
            <div className="g2" style={{ alignItems: "start" }}>

              {/* Left: PIN pad / staff actions */}
              <div className="col gap16">
                <div className="card">
                  <div className="card-h"><div className="card-t">Punch In</div></div>
                  <div className="card-b">

                    {/* ── No staff selected: show PIN pad ── */}
                    {!selStaff && (
                      <>
                        <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 14 }}>
                          {staff.length === 0
                            ? "No staff added yet — go to the Staff tab to add someone."
                            : "Enter your 4-digit PIN to clock in or out."}
                        </p>

                        {/* PIN dots */}
                        <div className="pin-dots">
                          {[0,1,2,3].map(i => (
                            <div key={i} className={pin.length > i ? "pin-dot on" : "pin-dot"} />
                          ))}
                        </div>

                        {/* Number pad */}
                        <div className="pinpad">
                          {[1,2,3,4,5,6,7,8,9].map(n => (
                            <button
                              key={n}
                              className="pin-key"
                              disabled={staff.length === 0}
                              onClick={() => handleDigit(String(n))}
                            >{n}</button>
                          ))}
                          <button className="pin-key" onClick={() => setPin(p => p.slice(0, -1))}>
                            <X size={18} />
                          </button>
                          <button className="pin-key" disabled={staff.length === 0} onClick={() => handleDigit("0")}>0</button>
                          <button className="pin-key" style={{ fontSize: 11 }} onClick={() => setPin("")}>CLR</button>
                        </div>
                      </>
                    )}

                    {/* ── Staff recognised: show actions ── */}
                    {selStaff && (
                      <div>
                        <div className="row between" style={{ marginBottom: 14 }}>
                          <div>
                            <div style={{ fontFamily: "var(--serif)", fontSize: 22 }}>G'day, {selStaff.name}!</div>
                            {selActive && (
                              <div style={{ fontSize: 12, color: "var(--ink2)", fontFamily: "var(--mono)", marginTop: 3 }}>
                                In {fmtTime(selActive.clockIn)} · {DEPTS.find(d => d.id === selActive.department)?.label} · {fmtDur(workedMs(selActive))} worked
                              </div>
                            )}
                          </div>
                          <button className="btn btn-g btn-sm" onClick={cancelPin}><X size={14} /></button>
                        </div>

                        <div className="col gap8">
                          {!selActive && (
                            <button className="btn btn-p btn-lg" onClick={() => setShowDepts(true)}>
                              <LogIn size={17} /> Clock In
                            </button>
                          )}
                          {selActive && (
                            <>
                              <button
                                className="btn btn-lg"
                                style={{ background: openBreak ? "#1a4a8c" : "var(--amber)", color: "#fff", justifyContent: "center" }}
                                onClick={() => doBreak("rest")}
                              >
                                <Coffee size={17} />
                                {openBreak ? "End Break" : "Rest Break  (20 min paid)"}
                              </button>
                              <button
                                className="btn btn-lg"
                                style={{ background: openBreak ? "#1a4a8c" : "#7a6a58", color: "#fff", justifyContent: "center" }}
                                onClick={() => doBreak("meal")}
                              >
                                <Utensils size={17} />
                                {openBreak ? "End Meal Break" : "Meal Break  (30 min unpaid + 20 min paid)"}
                              </button>
                              <button className="btn btn-d btn-lg" onClick={doClockOut}>
                                <LogOut size={17} /> Clock Out
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Open break info card */}
                {selActive && openBreak && (
                  <div className="card" style={{ borderColor: "var(--amber)", background: "var(--amberbg)" }}>
                    <div className="card-b row gap8">
                      <Coffee size={15} style={{ color: "var(--amber)", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {openBreak.type === "meal" ? "Meal break in progress" : "Rest break in progress"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ink2)", fontFamily: "var(--mono)" }}>
                          {openBreak.type === "meal"
                            ? "First 30 min unpaid · next 20 min paid · then unpaid again"
                            : "First 20 min paid · then unpaid"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: who's in + today's roster */}
              <div className="col gap16">
                <div className="card">
                  <div className="card-h row between">
                    <div className="card-t">On the Farm Now</div>
                    <span className="badge b-green">{currentlyIn.length} on shift</span>
                  </div>
                  {currentlyIn.length === 0
                    ? <div style={{ padding: "16px 18px", color: "var(--ink3)", fontSize: 13, fontStyle: "italic" }}>No-one clocked in yet.</div>
                    : <ul style={{ listStyle: "none" }}>
                      {currentlyIn.map(s => {
                        const ae = activeEntry(s.id);
                        const ob = ae.breaks.find(b => !b.end);
                        return (
                          <li key={s.id} style={{ padding: "11px 18px", borderBottom: "1px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: "var(--ink2)", fontFamily: "var(--mono)" }}>
                                {DEPTS.find(d => d.id === ae.department)?.label} · {fmtTime(ae.clockIn)} · {fmtDur(workedMs(ae))}
                              </div>
                            </div>
                            {ob
                              ? <span className="badge b-amber"><Coffee size={9} /> {ob.type === "meal" ? "Meal" : "Rest"}</span>
                              : <span className="badge b-green">Active</span>}
                          </li>
                        );
                      })}
                    </ul>
                  }
                </div>

                <div className="card">
                  <div className="card-h"><div className="card-t">Today's Roster</div></div>
                  {roster.filter(r => r.date === todayStr).length === 0
                    ? <div style={{ padding: "14px 18px", color: "var(--ink3)", fontSize: 13, fontStyle: "italic" }}>No shifts rostered today.</div>
                    : <ul style={{ listStyle: "none" }}>
                      {roster.filter(r => r.date === todayStr).map(r => {
                        const s = staff.find(x => x.id === r.staffId);
                        const clocked = entries.some(e => e.staffId === r.staffId && sydKey(e.clockIn) === todayStr);
                        return (
                          <li key={r.id} style={{ padding: "9px 18px", borderBottom: "1px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                            <span style={{ fontWeight: 500 }}>{s?.name || "—"}</span>
                            <div className="row gap8">
                              <span style={{ fontFamily: "var(--mono)", color: "var(--ink2)", fontSize: 12 }}>{r.startTime}{r.endTime ? " – " + r.endTime : ""}</span>
                              {clocked ? <span className="badge b-green">In</span> : <span className="badge b-gray">Pending</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TIMESHEETS ═════════════════════════════════════════════════════ */}
        {view === "timesheets" && (
          <div className="page">
            <div className="row between wrap gap8" style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: "var(--ink2)" }}>{entries.length} entries</div>
              <div className="row gap8">
                <button className="btn btn-o btn-sm" onClick={exportCSV}><Download size={13} /> Export CSV</button>
                <button className="btn btn-p btn-sm" onClick={doWeeklySummary}><Mail size={13} /> Weekly Email</button>
              </div>
            </div>
            <div className="card">
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr><th>Staff</th><th>Department</th><th>Date</th><th>In</th><th>Out</th><th>Break</th><th>Worked</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 && (
                      <tr><td colSpan={9} style={{ color: "var(--ink3)", textAlign: "center", fontStyle: "italic", padding: 24 }}>No entries yet</td></tr>
                    )}
                    {[...entries].sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn)).map(e => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 600 }}>{e.staffName}</td>
                        <td style={{ fontSize: 12, color: "var(--ink2)" }}>{DEPTS.find(d => d.id === e.department)?.label || "—"}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{fmtDate(e.clockIn)}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{fmtTime(e.clockIn)}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{e.clockOut ? fmtTime(e.clockOut) : <span style={{ color: "var(--green)" }}>Active</span>}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink2)" }}>{breakTotalMs(e) > 0 ? fmtDur(breakTotalMs(e)) : "—"}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{fmtDur(workedMs(e))}</td>
                        <td>{e.clockOut ? <span className="badge b-gray">Closed</span> : <span className="badge b-green">Active</span>}</td>
                        <td><button className="btn btn-g btn-sm" onClick={() => openEdit(e)}><Edit2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ ROSTER ═════════════════════════════════════════════════════════ */}
        {view === "roster" && (
          <div className="page">
            <div className="row between" style={{ marginBottom: 16 }}>
              <div className="row gap8">
                <button className="btn btn-g btn-sm" onClick={() => setCalMo(p => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}><ChevronLeft size={15} /></button>
                <span style={{ fontFamily: "var(--serif)", fontSize: 17 }}>{new Date(calMo.y, calMo.m, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</span>
                <button className="btn btn-g btn-sm" onClick={() => setCalMo(p => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}><ChevronRight size={15} /></button>
              </div>
              <button className="btn btn-p btn-sm" onClick={() => setShowAddRoster(true)}><Plus size={13} /> Add Shift</button>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-b">
                <div className="cal-grid" style={{ marginBottom: 6 }}>
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="cal-dh">{d}</div>)}
                </div>
                <div className="cal-grid">
                  {Array(firstDOW(calMo.y, calMo.m)).fill(null).map((_, i) => <div key={"e"+i} className="cal-day empty" />)}
                  {Array(daysInMonth(calMo.y, calMo.m)).fill(null).map((_, i) => {
                    const day = i + 1;
                    const dk  = calMo.y + "-" + String(calMo.m+1).padStart(2,"0") + "-" + String(day).padStart(2,"0");
                    const hol = HOLIDAYS[dk];
                    const shifts = roster.filter(r => r.date === dk);
                    return (
                      <div key={day} className={["cal-day", dk === todayStr ? "today" : "", hol ? "hol" : ""].filter(Boolean).join(" ")}>
                        <div className="cal-num">{day}</div>
                        {hol && <div className="cal-chip" style={{ color: "var(--red)", fontWeight: 600, fontSize: 8 }}>{hol}</div>}
                        {shifts.map(s => {
                          const st = staff.find(x => x.id === s.staffId);
                          return <div key={s.id} className="cal-chip" style={{ background: "var(--greenbg)", color: "var(--green)", marginTop: 2 }}>{st?.name} {s.startTime}</div>;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><div className="card-t">All Shifts</div></div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Staff</th><th>Date</th><th>Start</th><th>End</th><th></th></tr></thead>
                  <tbody>
                    {roster.length === 0 && <tr><td colSpan={5} style={{ color: "var(--ink3)", textAlign: "center", fontStyle: "italic", padding: 20 }}>No shifts added</td></tr>}
                    {[...roster].sort((a,b) => a.date.localeCompare(b.date)).map(r => {
                      const s = staff.find(x => x.id === r.staffId);
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{s?.name || "—"}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.date}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.startTime}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.endTime || "—"}</td>
                          <td><button className="btn btn-g btn-sm" style={{ color: "var(--red)" }} onClick={() => { saveRoster(roster.filter(x => x.id !== r.id)); showToast("Shift removed"); }}><X size={12} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ LEAVE ══════════════════════════════════════════════════════════ */}
        {view === "leave" && (
          <div className="page">
            <div className="row between wrap gap8" style={{ marginBottom: 16 }}>
              <div className="row gap4 wrap">
                <span className="badge b-red">Red = NSW public holiday</span>
                <span className="badge b-blue">Blue = approved leave</span>
                <span className="badge b-amber">Orange = pending</span>
              </div>
              <div className="row gap8">
                <div className="row gap8">
                  <button className="btn btn-g btn-sm" onClick={() => setCalMo(p => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}><ChevronLeft size={15} /></button>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{new Date(calMo.y, calMo.m, 1).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}</span>
                  <button className="btn btn-g btn-sm" onClick={() => setCalMo(p => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}><ChevronRight size={15} /></button>
                </div>
                <button className="btn btn-p btn-sm" onClick={() => setShowLeaveForm(true)}><Plus size={13} /> Request Leave</button>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-b">
                <div className="cal-grid" style={{ marginBottom: 6 }}>
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="cal-dh">{d}</div>)}
                </div>
                <div className="cal-grid">
                  {Array(firstDOW(calMo.y, calMo.m)).fill(null).map((_, i) => <div key={"e"+i} className="cal-day empty" />)}
                  {Array(daysInMonth(calMo.y, calMo.m)).fill(null).map((_, i) => {
                    const day = i + 1;
                    const dk  = calMo.y + "-" + String(calMo.m+1).padStart(2,"0") + "-" + String(day).padStart(2,"0");
                    const hol = HOLIDAYS[dk];
                    const appr = leaves.filter(l => l.from <= dk && l.to >= dk && l.status === "approved");
                    const pend = leaves.filter(l => l.from <= dk && l.to >= dk && l.status === "pending");
                    return (
                      <div key={day} className={["cal-day", dk === todayStr ? "today" : "", hol ? "hol" : ""].filter(Boolean).join(" ")}>
                        <div className="cal-num">{day}</div>
                        {hol && <div className="cal-chip" style={{ color: "var(--red)", fontWeight: 600, fontSize: 8 }}>{hol}</div>}
                        {appr.map(l => <div key={l.id} className="cal-chip" style={{ background: "var(--bluebg)", color: "var(--blue)", marginTop: 2, fontSize: 8 }}>{l.staffName}</div>)}
                        {pend.map(l => <div key={l.id} className="cal-chip" style={{ background: "var(--amberbg)", color: "var(--amber)", marginTop: 2, fontSize: 8 }}>{l.staffName}?</div>)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><div className="card-t">Leave Requests</div></div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Note</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {leaves.length === 0 && <tr><td colSpan={7} style={{ color: "var(--ink3)", textAlign: "center", fontStyle: "italic", padding: 20 }}>No requests</td></tr>}
                    {[...leaves].sort((a,b) => new Date(b.submitted) - new Date(a.submitted)).map(l => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 600 }}>{l.staffName}</td>
                        <td style={{ textTransform: "capitalize", fontSize: 12 }}>{l.type}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{l.from}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{l.to}</td>
                        <td style={{ fontSize: 12, color: "var(--ink2)" }}>{l.note || "—"}</td>
                        <td>
                          {l.status === "approved" && <span className="badge b-green">Approved</span>}
                          {l.status === "pending"  && <span className="badge b-amber">Pending</span>}
                          {l.status === "declined" && <span className="badge b-red">Declined</span>}
                        </td>
                        <td>
                          {l.status === "pending" && (
                            <div className="row gap4">
                              <button className="btn btn-p btn-sm" onClick={() => { saveLeaves(leaves.map(x => x.id === l.id ? { ...x, status: "approved" } : x)); showToast("Approved"); }}><Check size={11} /> Approve</button>
                              <button className="btn btn-o btn-sm" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => { saveLeaves(leaves.map(x => x.id === l.id ? { ...x, status: "declined" } : x)); showToast("Declined"); }}><X size={11} /> Decline</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ REPORTS ════════════════════════════════════════════════════════ */}
        {view === "reports" && (() => {
          const dr     = deptReport();
          const sr     = staffReport();
          const trend  = dailyTrend();
          const filtered = rptEntries();
          const totalMs  = filtered.reduce((a, e) => a + workedMs(e), 0);
          const totalH   = totalMs / 3600000;
          const avgShift = filtered.length > 0 ? totalMs / filtered.length / 3600000 : 0;
          const topDept  = dr.find(d => d.ms > 0);
          const topStaff = sr.find(s => s.ms > 0);
          const trendMax = Math.max(...trend.map(d => d.hrs), 0.1);
          const { from, to } = rptDates();
          const dateLabel = from.toLocaleDateString("en-AU", { day:"numeric", month:"short" }) + " – " + to.toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" });

          return (
            <div className="page">
              {/* Date range filter */}
              <div className="rpt-filter">
                <span style={{ fontSize: 12, color: "var(--ink2)", marginRight: 4 }}>Period:</span>
                {[["thisWeek","This week"],["lastWeek","Last week"],["thisMonth","This month"],["lastMonth","Last month"],["custom","Custom"]].map(([val, lbl]) => (
                  <button key={val} className={rptRange === val ? "filter-btn on" : "filter-btn"} onClick={() => setRptRange(val)}>{lbl}</button>
                ))}
                {rptRange === "custom" && (
                  <div className="row gap8" style={{ marginLeft: 4 }}>
                    <input type="date" className="finp" style={{ width: 140, padding: "5px 9px", fontSize: 12 }} value={rptFrom} onChange={e => setRptFrom(e.target.value)} />
                    <span style={{ fontSize: 12, color: "var(--ink3)" }}>to</span>
                    <input type="date" className="finp" style={{ width: 140, padding: "5px 9px", fontSize: 12 }} value={rptTo} onChange={e => setRptTo(e.target.value)} />
                  </div>
                )}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink3)", fontFamily: "var(--mono)" }}>{dateLabel}</span>
              </div>

              {/* KPI cards */}
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-val">{totalH.toFixed(1)}<span style={{ fontSize: 14, fontFamily: "var(--sans)", color: "var(--ink2)", marginLeft: 3 }}>hrs</span></div>
                  <div className="kpi-lbl">Total hours worked</div>
                </div>
                <div className="kpi">
                  <div className="kpi-val">{filtered.length}</div>
                  <div className="kpi-lbl">Shifts completed</div>
                </div>
                <div className="kpi">
                  <div className="kpi-val">{avgShift.toFixed(1)}<span style={{ fontSize: 14, fontFamily: "var(--sans)", color: "var(--ink2)", marginLeft: 3 }}>hrs</span></div>
                  <div className="kpi-lbl">Avg shift length</div>
                </div>
                <div className="kpi">
                  <div className="kpi-val" style={{ fontSize: 18, marginTop: 4 }}>{topDept?.label || "—"}</div>
                  <div className="kpi-lbl">Busiest department</div>
                </div>
              </div>

              <div className="g2" style={{ alignItems: "start", marginBottom: 18 }}>
                {/* Hours by department */}
                <div className="card">
                  <div className="card-h row between">
                    <div className="card-t">Hours by Department</div>
                    <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "var(--mono)" }}>{totalH.toFixed(1)} hrs total</span>
                  </div>
                  <div className="card-b">
                    {dr.every(d => d.ms === 0) ? (
                      <div style={{ color: "var(--ink3)", fontStyle: "italic", fontSize: 13 }}>No completed shifts in this period.</div>
                    ) : dr.filter(d => d.ms > 0).map((dep, i) => (
                      <div key={dep.id} className="stat-row">
                        <div className="stat-label">
                          <dep.Icon size={14} style={{ color: DEPT_COLORS[i % DEPT_COLORS.length], flexShrink: 0 }} />
                          {dep.label}
                        </div>
                        <div className="stat-bar-bg">
                          <div className="stat-bar-fill" style={{ width: dep.pct + "%", background: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                        </div>
                        <div className="stat-val">{dep.hrs.toFixed(1)}h</div>
                        <div className="stat-pct">{dep.pct.toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hours by staff member */}
                <div className="card">
                  <div className="card-h row between">
                    <div className="card-t">Hours by Staff Member</div>
                    <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "var(--mono)" }}>{sr.filter(s => s.ms > 0).length} active</span>
                  </div>
                  <div className="card-b">
                    {sr.every(s => s.ms === 0) ? (
                      <div style={{ color: "var(--ink3)", fontStyle: "italic", fontSize: 13 }}>No completed shifts in this period.</div>
                    ) : sr.filter(s => s.ms > 0).map((s, i) => (
                      <div key={s.id} className="stat-row">
                        <div className="stat-label">
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: DEPT_COLORS[i % DEPT_COLORS.length], flexShrink: 0 }} />
                          {s.name}
                        </div>
                        <div className="stat-bar-bg">
                          <div className="stat-bar-fill" style={{ width: s.pct + "%", background: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                        </div>
                        <div className="stat-val">{s.hrs.toFixed(1)}h</div>
                        <div className="stat-pct">{s.pct.toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Daily trend */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="card-h row between">
                  <div className="card-t">Daily Hours Trend</div>
                  <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "var(--mono)" }}>{trend.length} days</span>
                </div>
                <div className="card-b">
                  {trend.length === 0 ? (
                    <div style={{ color: "var(--ink3)", fontStyle: "italic", fontSize: 13 }}>No data for this period.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 130, minWidth: trend.length * 36 }}>
                        {trend.map((day, i) => (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                              <div
                                style={{
                                  width: "100%",
                                  height: ((day.hrs / trendMax) * 100) + "%",
                                  background: day.hrs > 0 ? "var(--green)" : "var(--bdr)",
                                  borderRadius: "4px 4px 0 0",
                                  minHeight: 2,
                                  transition: "height .4s ease",
                                  position: "relative",
                                }}
                                title={day.label + ": " + day.hrs.toFixed(1) + "h"}
                              >
                                {day.hrs > 0 && (
                                  <div style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontFamily: "var(--mono)", color: "var(--ink2)", whiteSpace: "nowrap" }}>
                                    {day.hrs.toFixed(1)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--ink3)", textAlign: "center", lineHeight: 1.2, maxWidth: 32 }}>
                              {day.label.split(" ")[0]}<br />{day.label.split(" ")[1]}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Staff × Department breakdown table */}
              <div className="card">
                <div className="card-h row between">
                  <div className="card-t">Staff × Department Breakdown</div>
                  <button className="btn btn-o btn-sm" onClick={() => {
                    const rows = [["Staff", ...DEPTS.map(d => d.label), "Total"]];
                    sr.forEach(s => {
                      const depHrs = DEPTS.map(dep => {
                        const ms = filtered.filter(e => e.staffId === s.id && e.department === dep.id).reduce((a, e) => a + workedMs(e), 0);
                        return (ms / 3600000).toFixed(2);
                      });
                      rows.push([s.name, ...depHrs, s.hrs.toFixed(2)]);
                    });
                    // totals row
                    rows.push(["TOTAL", ...DEPTS.map(dep => (dr.find(d => d.id === dep.id)?.hrs || 0).toFixed(2)), totalH.toFixed(2)]);
                    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
                    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" })); a.download = "foodfarm-dept-report-" + todayStr + ".csv"; a.click();
                    showToast("Report exported");
                  }}><Download size={12} /> Export</button>
                </div>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Staff</th>
                        {DEPTS.map(d => <th key={d.id}>{d.label}</th>)}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={DEPTS.length + 2} style={{ color: "var(--ink3)", textAlign: "center", fontStyle: "italic", padding: 20 }}>No completed shifts in this period.</td></tr>
                      )}
                      {sr.filter(s => s.ms > 0).map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          {DEPTS.map(dep => {
                            const ms = filtered.filter(e => e.staffId === s.id && e.department === dep.id).reduce((a, e) => a + workedMs(e), 0);
                            return <td key={dep.id} style={{ fontFamily: "var(--mono)", fontSize: 12, color: ms > 0 ? "var(--ink)" : "var(--ink3)" }}>{ms > 0 ? (ms/3600000).toFixed(1) + "h" : "—"}</td>;
                          })}
                          <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{s.hrs.toFixed(1)}h</td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      {filtered.length > 0 && (
                        <tr style={{ background: "var(--bg)", borderTop: "2px solid var(--bdr)" }}>
                          <td style={{ fontWeight: 600, fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Total</td>
                          {DEPTS.map(dep => {
                            const d = dr.find(x => x.id === dep.id);
                            return <td key={dep.id} style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{d && d.hrs > 0 ? d.hrs.toFixed(1) + "h" : "—"}</td>;
                          })}
                          <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700 }}>{totalH.toFixed(1)}h</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ STAFF ══════════════════════════════════════════════════════════ */}
        {view === "staff" && (
          <div className="page">
            <div className="row between" style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: "var(--ink2)" }}>{staff.length} member{staff.length !== 1 ? "s" : ""}</div>
              <button className="btn btn-p btn-sm" onClick={() => setShowAddStaff(true)}><UserPlus size={13} /> Add Staff</button>
            </div>
            {staff.length === 0 && (
              <div className="card">
                <div className="card-b" style={{ textAlign: "center", padding: 32, color: "var(--ink3)", fontStyle: "italic" }}>
                  No staff added yet. Click "Add Staff" to get started.
                </div>
              </div>
            )}
            <div className="g3">
              {staff.map(s => {
                const ae = activeEntry(s.id);
                const wkStart = sydNow(); wkStart.setDate(wkStart.getDate() - ((wkStart.getDay() + 6) % 7)); wkStart.setHours(0,0,0,0);
                const wkMs = entries.filter(e => e.staffId === s.id && new Date(e.clockIn) >= wkStart).reduce((a, e) => a + workedMs(e), 0);
                return (
                  <div key={s.id} className="card">
                    <div className="card-b">
                      <div className="row between" style={{ marginBottom: 8 }}>
                        <div style={{ fontFamily: "var(--serif)", fontSize: 18 }}>{s.name}</div>
                        <button className="btn btn-g btn-sm" style={{ color: "var(--red)" }} onClick={() => { saveStaff(staff.filter(x => x.id !== s.id)); showToast(s.name + " removed"); }}><X size={14} /></button>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink2)", fontFamily: "var(--mono)", marginBottom: 10 }}>
                        PIN ··· {s.pin.slice(-1)} · {s.role === "manager" ? "Manager" : "Staff"}
                      </div>
                      {ae
                        ? <span className="badge b-green">On shift · {fmtDur(workedMs(ae))}</span>
                        : <span className="badge b-gray">Off</span>}
                      <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink2)" }}>This week: {fmtDur(wkMs)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ SETTINGS ═══════════════════════════════════════════════════════ */}
        {view === "settings" && (
          <div className="page" style={{ maxWidth: 560 }}>
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-h"><div className="card-t">GPS Verification</div></div>
              <div className="card-b">
                <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 14 }}>Pin the farm's location. Staff must be within 200m to clock in/out. Leave unset to skip the check.</p>
                {farmLoc ? (
                  <div>
                    <div className="row gap8" style={{ marginBottom: 12, fontSize: 12, fontFamily: "var(--mono)", color: "var(--green)" }}>
                      <CheckCircle2 size={14} /> Pinned at {farmLoc.lat.toFixed(5)}, {farmLoc.lng.toFixed(5)}
                    </div>
                    <div className="row gap8">
                      <button className="btn btn-o btn-sm" onClick={pinLocation}><RefreshCw size={12} /> Update</button>
                      <button className="btn btn-o btn-sm" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => { saveLoc(null); showToast("GPS check disabled"); }}><X size={12} /> Remove</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-p btn-sm" onClick={pinLocation}><MapPin size={13} /> Pin Current Location</button>
                )}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-h"><div className="card-t">Browser Notifications</div></div>
              <div className="card-b">
                <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 14 }}>Enable alerts when a rostered staff member hasn't clocked in 15 minutes after their shift starts.</p>
                <button className="btn btn-o btn-sm" onClick={() => Notification?.requestPermission().then(p => showToast(p === "granted" ? "Notifications enabled" : "Permission denied", p === "granted" ? "ok" : "err"))}>
                  <Bell size={13} /> Request Permission
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><div className="card-t">Weekly Summary Email</div></div>
              <div className="card-b">
                <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 14 }}>
                  Auto-sends every Monday at 8am (Sydney time) to {MANAGER}. Shows Mon–Fri, Saturday, and Sunday hours separately per staff member. Trigger manually anytime below.
                </p>
                <button className="btn btn-p btn-sm" onClick={doWeeklySummary}><Mail size={13} /> Send Now</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════════════════ */}

      {/* Dept picker */}
      {showDepts && (
        <div className="overlay" onClick={() => setShowDepts(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div className="modal-t">Where are you working today?</div>
              <button className="btn btn-g btn-sm" onClick={() => setShowDepts(false)}><X size={14} /></button>
            </div>
            <ul className="dept-list">
              {DEPTS.map(({ id, label, Icon }) => (
                <li key={id} onClick={() => doClockIn(id)}>
                  <Icon size={17} style={{ color: "var(--green)" }} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Add staff */}
      {showAddStaff && (
        <div className="overlay" onClick={() => setShowAddStaff(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div className="modal-t">Add Staff Member</div>
              <button className="btn btn-g btn-sm" onClick={() => setShowAddStaff(false)}><X size={14} /></button>
            </div>
            <div className="modal-b">
              <div className="fg">
                <label className="flbl">Full Name</label>
                <input className="finp" value={fsName} onChange={e => setFsName(e.target.value)} placeholder="e.g. Tim" />
              </div>
              <div className="fg">
                <label className="flbl">4-digit PIN</label>
                <input
                  className="finp"
                  inputMode="numeric"
                  maxLength={4}
                  value={fsPin}
                  onChange={e => setFsPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 1234"
                  style={{ letterSpacing: "0.3em", fontFamily: "var(--mono)" }}
                />
              </div>
              <div className="fg">
                <label className="flbl">Role</label>
                <select className="finp" value={fsRole} onChange={e => setFsRole(e.target.value)}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn btn-o" onClick={() => setShowAddStaff(false)}>Cancel</button>
              <button className="btn btn-p" onClick={doAddStaff}><UserPlus size={13} /> Add to Crew</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit entry */}
      {editingEntry && (
        <div className="overlay" onClick={() => setEditingEntry(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div className="modal-t">Edit Entry – {editingEntry.staffName}</div>
              <button className="btn btn-g btn-sm" onClick={() => setEditingEntry(null)}><X size={14} /></button>
            </div>
            <div className="modal-b">
              <div className="fg"><label className="flbl">Clock In</label><input type="datetime-local" className="finp" value={eeIn} onChange={e => setEeIn(e.target.value)} /></div>
              <div className="fg"><label className="flbl">Clock Out</label><input type="datetime-local" className="finp" value={eeOut} onChange={e => setEeOut(e.target.value)} /></div>
              <div className="fg"><label className="flbl">Note (reason for edit)</label><textarea className="finp" rows={2} value={eeNote} onChange={e => setEeNote(e.target.value)} /></div>
            </div>
            <div className="modal-f">
              <button className="btn btn-o" onClick={() => setEditingEntry(null)}>Cancel</button>
              <button className="btn btn-p" onClick={doSaveEdit}><Check size={13} /> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add roster shift */}
      {showAddRoster && (
        <div className="overlay" onClick={() => setShowAddRoster(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div className="modal-t">Add Roster Shift</div>
              <button className="btn btn-g btn-sm" onClick={() => setShowAddRoster(false)}><X size={14} /></button>
            </div>
            <div className="modal-b">
              <div className="fg">
                <label className="flbl">Staff Member</label>
                <select className="finp" value={frStaff} onChange={e => setFrStaff(e.target.value)}>
                  <option value="">Select…</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="fg"><label className="flbl">Date</label><input type="date" className="finp" value={frDate} onChange={e => setFrDate(e.target.value)} /></div>
              <div className="row gap12">
                <div className="fg" style={{ flex: 1 }}><label className="flbl">Start Time</label><input type="time" className="finp" value={frStart} onChange={e => setFrStart(e.target.value)} /></div>
                <div className="fg" style={{ flex: 1 }}><label className="flbl">End Time (opt.)</label><input type="time" className="finp" value={frEnd} onChange={e => setFrEnd(e.target.value)} /></div>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn btn-o" onClick={() => setShowAddRoster(false)}>Cancel</button>
              <button className="btn btn-p" onClick={doAddShift}><Plus size={13} /> Add Shift</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave request */}
      {showLeaveForm && (
        <div className="overlay" onClick={() => setShowLeaveForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div className="modal-t">Request Leave</div>
              <button className="btn btn-g btn-sm" onClick={() => setShowLeaveForm(false)}><X size={14} /></button>
            </div>
            <div className="modal-b">
              <div className="fg">
                <label className="flbl">Staff Member</label>
                <select className="finp" value={flStaff} onChange={e => setFlStaff(e.target.value)}>
                  <option value="">Select…</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="flbl">Leave Type</label>
                <select className="finp" value={flType} onChange={e => setFlType(e.target.value)}>
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="personal">Personal Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="row gap12">
                <div className="fg" style={{ flex: 1 }}><label className="flbl">From</label><input type="date" className="finp" value={flFrom} onChange={e => setFlFrom(e.target.value)} /></div>
                <div className="fg" style={{ flex: 1 }}><label className="flbl">To</label><input type="date" className="finp" value={flTo} onChange={e => setFlTo(e.target.value)} /></div>
              </div>
              <div className="fg"><label className="flbl">Note (optional)</label><textarea className="finp" rows={2} value={flNote} onChange={e => setFlNote(e.target.value)} placeholder="Any context for Hannah…" /></div>
              <div style={{ padding: "9px 12px", background: "var(--bluebg)", borderRadius: "var(--rs)", fontSize: 12, color: "var(--blue)" }}>
                <Mail size={11} style={{ display: "inline", marginRight: 5 }} />
                Submitting will open your email app pre-filled to {MANAGER}
              </div>
            </div>
            <div className="modal-f">
              <button className="btn btn-o" onClick={() => setShowLeaveForm(false)}>Cancel</button>
              <button className="btn btn-p" onClick={doSubmitLeave}><Send size={13} /> Submit & Email</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={"toast toast-" + toast.type}>
          {toast.type === "ok"   && <CheckCircle2 size={14} />}
          {toast.type === "err"  && <AlertCircle size={14} />}
          {toast.type === "warn" && <Bell size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
