/* ========================= MOTEUR (port de backend/) ========================= */
(function (root) {
'use strict';
var h32 = function () {
  var h = 0x811C9DC5;
  for (var i = 0; i < arguments.length; i++) { h ^= (arguments[i] >>> 0); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
};
var u = function () { var a = Array.prototype.slice.call(arguments); return (h32.apply(null, a) + 0.5) / 4294967296; };
var g = function () {
  var a = Array.prototype.slice.call(arguments);
  return Math.sqrt(-2 * Math.log(u.apply(null, a.concat([1])))) * Math.cos(2 * Math.PI * u.apply(null, a.concat([2])));
};
var sum = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; };

var PROFILES = {
  maison_gaz:  { key: 'maison_gaz',  seed: 11, label: 'Maison, chauffage au gaz', short: 'Maison au gaz', description: '4 personnes, chauffage et eau chaude au gaz, climatisation centrale', people: 4, elecBase: 25.0, dhwElec: 0.0, heatElec: 0.0, hasGas: true,  gasDhw: 1.25, gasHeat: 0.40, ac: true,  house: true },
  condo_elec:  { key: 'condo_elec',  seed: 22, label: 'Condo, tout à l’électricité', short: 'Condo tout électrique', description: '2 personnes, plinthes électriques et chauffe-eau, pas de gaz', people: 2, elecBase: 9.5,  dhwElec: 4.0, heatElec: 1.0, hasGas: false, gasDhw: 0.0,  gasHeat: 0.0,  ac: false, house: false },
  maison_elec: { key: 'maison_elec', seed: 33, label: 'Maison, tout à l’électricité', short: 'Maison tout électrique', description: '4 personnes, chauffage et eau chaude à l’électricité, climatisation centrale', people: 4, elecBase: 21.0, dhwElec: 8.0, heatElec: 2.7, hasGas: false, gasDhw: 0.0,  gasHeat: 0.0,  ac: true,  house: true }
};
var PRIORS = {
  maison_gaz:  { elec: [22.0, 0.0], gas: [1.0, 0.33], water: [1.00, 0.0] },
  condo_elec:  { elec: [12.5, 1.15], gas: null, water: [0.47, 0.0] },
  maison_elec: { elec: [27.0, 2.3], gas: null, water: [1.00, 0.0] }
};
var RAW_E = [0.6,0.5,0.5,0.5,0.55,0.8,1.3,1.6,1.2,0.9,0.85,0.9,1.0,0.9,0.85,0.9,1.2,1.9,2.3,2.2,1.9,1.5,1.1,0.8];
var RAW_W = [0.2,0.1,0.1,0.1,0.2,0.8,2.6,3.2,2.0,1.2,1.0,1.1,1.4,1.0,0.9,1.0,1.4,2.2,2.8,2.6,2.2,1.6,0.9,0.4];
var ELEC_N = RAW_E.map(function (x) { return x / sum(RAW_E); });
var WATER_N = RAW_W.map(function (x) { return x / sum(RAW_W); });
var UTILS = ['elec', 'gas', 'water'];

/* ---- tarifs ---- */
var GST = 0.05, QST = 0.09975, TAX_RATE = GST + QST;
var TARIFFS = {
  version: '2026-11-05', currency: 'CAD',
  electricity: { provider: 'Hydro-Québec', rate: 'D', label: 'Tarif D (résidentiel)', effective: '2026-04-01', access_fee_per_day: 0.46154, tier1_kwh_per_day: 40.0, tier1_price: 0.07065, tier2_price: 0.11142, taxed: true, verified: true, source: 'Régie de l’énergie, dossier R-4307-2025 (grille du 1er avril 2026)' },
  gas: { provider: 'Énergir', rate: 'D1', label: 'Tarif D1 (service général)', effective: '2026-10-01', base_fee_per_day: 0.70, components_per_m3: { distribution: 0.279, fourniture: 0.190, transport: 0.083, equilibrage: 0.040, spede: 0.085 }, taxed: true, verified: false, source: 'Calibré sur le cas type Énergir (2 000 m³/an ≈ 1 610 $/an avant taxes)' },
  water: { provider: 'Municipalité (tarif au compteur)', rate: 'Compteur', label: 'Eau potable, tarif au compteur', effective: '2026-01-01', per_m3: 1.50, fixed_per_day: 0.0, taxed: false, verified: false, source: 'Ordre de grandeur de règlements municipaux 2026 (1,00 $ à 2,00 $/m³)' }
};
function gasPrice() { var c = TARIFFS.gas.components_per_m3, s = 0; for (var k in c) s += c[k]; return s; }
function electricityBill(kwh, days) {
  var t = TARIFFS.electricity; kwh = Math.max(0, kwh);
  var thr = t.tier1_kwh_per_day * days, t1 = Math.min(kwh, thr), t2 = Math.max(0, kwh - thr);
  var sub = t1 * t.tier1_price + t2 * t.tier2_price + t.access_fee_per_day * days;
  return { subtotal: sub, total: sub + sub * TAX_RATE, tier2_kwh: t2, threshold_kwh: thr };
}
function gasBill(m3, days) { m3 = Math.max(0, m3); var sub = TARIFFS.gas.base_fee_per_day * days + m3 * gasPrice(); return { subtotal: sub, total: sub + sub * TAX_RATE }; }
function waterBill(m3, days) { m3 = Math.max(0, m3); var sub = m3 * TARIFFS.water.per_m3 + TARIFFS.water.fixed_per_day * days; return { subtotal: sub, total: sub }; }
function billTotal(util, use, days) { return (util === 'elec' ? electricityBill : util === 'gas' ? gasBill : waterBill)(use, days).total; }
function marginalPrice(use, days) { var t = TARIFFS.electricity; return (use >= t.tier1_kwh_per_day * days ? t.tier2_price : t.tier1_price) * (1 + TAX_RATE); }

/* ---- dates ---- */
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function dayInfo(y, m, d) {
  var ms = Date.UTC(y, m - 1, d);
  return { dn: Math.floor(ms / 864e5), doy: Math.round((ms - Date.UTC(y, 0, 1)) / 864e5) + 1, dow: (new Date(ms).getUTCDay() + 6) % 7 };
}
function iso(y, m, d) { return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
function shiftMonth(y, m, delta) { var idx = y * 12 + (m - 1) + delta; return { y: Math.floor(idx / 12), m: idx % 12 + 1 }; }

/* ---- météo ---- */
function tNormal(doy) { return 6.5 - 15.8 * Math.cos(2 * Math.PI * (doy - 20) / 365); }
function diurnalAmp(doy) { return 3.8 - 1.4 * Math.cos(2 * Math.PI * (doy - 20) / 365); }
function climoTemp(doy, hour) { return tNormal(doy) + diurnalAmp(doy) * Math.sin(2 * Math.PI * (hour - 9) / 24); }
function anomaly(dn) { return 5.5 * (0.5 * g(77, dn) + 0.3 * g(77, dn - 1) + 0.2 * g(77, dn - 2)); }
function tempAt(dn, doy, hour) { return climoTemp(doy, hour) + anomaly(dn) + 0.5 * g(78, dn, hour); }

/* ---- simulation ---- */
function simHour(p, dn, doy, dow, hour) {
  var s = p.seed, t = tempAt(dn, doy, hour), wk = dow >= 5;
  var light = 1.0 + 0.10 * Math.cos(2 * Math.PI * (doy - 355) / 365);
  var e = p.elecBase * (wk ? 1.08 : 1.0) * light * ELEC_N[hour];
  e *= Math.max(0.55, 1.0 + 0.14 * g(s, dn, hour, 10));
  if (hour >= 17 && hour <= 21 && u(s, dn, hour, 11) < 0.07) e += 1.1 + 0.8 * u(s, dn, hour, 12);
  var setback = (hour < 6 || hour >= 23) ? 0.88 : 1.04;
  var hddH = Math.max(0, 18 - t) / 24;
  if (p.dhwElec > 0) e += p.dhwElec * WATER_N[hour] * Math.max(0.5, 1.0 + 0.10 * g(s, dn, hour, 13));
  if (p.heatElec > 0) e += p.heatElec * hddH * setback * Math.max(0.5, 1.0 + 0.06 * g(s, dn, hour, 14));
  if (p.ac) e += 0.30 * Math.max(0, t - 22);
  var gas = 0;
  if (p.hasGas) gas = p.gasDhw * WATER_N[hour] * Math.max(0.5, 1.0 + 0.10 * g(s, dn, hour, 20)) + p.gasHeat * hddH * setback * Math.max(0.5, 1.0 + 0.08 * g(s, dn, hour, 21));
  var w = p.people * 220 * (wk ? 1.10 : 1.0) * WATER_N[hour] * Math.max(0.3, 1.0 + 0.28 * g(s, dn, hour, 30));
  if (hour >= 8 && hour <= 21 && u(s, dn, hour, 31) < 0.045) w += p.people * (30 + 20 * u(s, dn, hour, 32));
  if (p.house) w *= 1.0 + 0.30 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * (doy - 110) / 365)), 2);
  return { t: t, elec: e, gas: gas, water: w };
}
var memoDay = {};
function dayRecord(p, y, m, d) {
  var key = p.key + '|' + y + '|' + m + '|' + d;
  if (memoDay[key]) return memoDay[key];
  var di = dayInfo(y, m, d), e = 0, gs = 0, w = 0, ts = 0;
  for (var h = 0; h < 24; h++) { var r = simHour(p, di.dn, di.doy, di.dow, h); e += r.elec; gs += r.gas; w += r.water; ts += r.t; }
  return (memoDay[key] = { date: iso(y, m, d), day: d, doy: di.doy, dow: di.dow, tmean: ts / 24, elec: e, gas: gs, water: w / 1000 });
}
function partialDay(p, y, m, d, hour, minute, second) {
  var di = dayInfo(y, m, d), frac = (minute * 60 + second) / 3600, e = 0, gs = 0, w = 0, temps = [];
  for (var h = 0; h < hour; h++) { var r = simHour(p, di.dn, di.doy, di.dow, h); e += r.elec; gs += r.gas; w += r.water; temps.push(r.t); }
  var cur = simHour(p, di.dn, di.doy, di.dow, hour);
  e += cur.elec * frac; gs += cur.gas * frac; w += cur.water * frac; temps.push(cur.t);
  return { date: iso(y, m, d), day: d, doy: di.doy, dow: di.dow, hours: hour + frac, temps: temps, elec: e, gas: gs, water: w / 1000, current: cur };
}

/* ---- prévision ---- */
var Z80 = 1.2816, N0 = 6.0, SIGMA_T = 3.4, WEEKEND_F = { elec: 1.06, gas: 1.0, water: 1.10 };
function erf(x) {
  var sign = x < 0 ? -1 : 1; x = Math.abs(x);
  var t = 1 / (1 + 0.3275911 * x);
  var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
function ncdf(z) { return 0.5 * (1 + erf(z / Math.sqrt(2))); }
function npdf(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
function expectedHdd(mu, sigma) { sigma = sigma === undefined ? SIGMA_T : sigma; var z = (18 - mu) / sigma; return [(18 - mu) * ncdf(z) + sigma * npdf(z), ncdf(z)]; }
function hourWeights(util, heating) {
  var flat = 1 / 24;
  if (util === 'water') return WATER_N;
  if (util === 'gas') return WATER_N.map(function (w) { return 0.7 * flat + 0.3 * w; });
  if (heating) return ELEC_N.map(function (w) { return 0.5 * flat + 0.5 * w; });
  return ELEC_N;
}
function fitModel(days, util, prior) {
  var a0 = prior[0], b0 = prior[1], n = days.length, wk = WEEKEND_F[util];
  var xs = days.map(function (d) { return Math.max(0, 18 - d.tmean); });
  var ys = days.map(function (d) { return d[util] / (d.dow >= 5 ? wk : 1); });
  if (n === 0) return { a: a0, b: b0, sigma: 0.12 * (a0 + b0 * 8), n: 0, wk: wk };
  var xbar = sum(xs) / n, ybar = sum(ys) / n, w = n / (n + N0), b;
  if (b0 === 0) b = 0;
  else {
    var sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) sxx += Math.pow(xs[i] - xbar, 2);
    var bols;
    if (n >= 4 && sxx / n > 1.0) {
      for (i = 0; i < n; i++) sxy += (xs[i] - xbar) * (ys[i] - ybar);
      bols = Math.min(Math.max(sxy / sxx, 0), 3 * b0);
    } else bols = b0;
    b = w * bols + (1 - w) * b0;
  }
  var a = w * (ybar - b * xbar) + (1 - w) * a0, sigma;
  if (n >= 4) {
    var sse = 0; for (var j = 0; j < n; j++) sse += Math.pow(ys[j] - (a + b * xs[j]), 2);
    sigma = Math.max(Math.sqrt(sse / (n - 2)), 0.04 * ybar);
  } else sigma = 0.12 * ybar;
  return { a: a, b: b, sigma: sigma, n: n, wk: wk };
}
function defaultWeather(doy, k, recentAnom) { return tNormal(doy) + recentAnom * Math.pow(0.45, k); }

function buildForecast(pk, y, m, todayN, days, today, lastTotal) {
  var prior = PRIORS[pk], dim = daysInMonth(y, m);
  var recent = days.slice(-3), recentAnom = recent.length ? sum(recent.map(function (d) { return d.tmean - tNormal(d.doy); })) / recent.length : 0;
  var hoursDone = today.hours, obs = today.temps, doyT = today.doy;
  var anomToday = obs.length >= 3 ? sum(obs.map(function (t, h) { return t - climoTemp(doyT, h); })) / obs.length : recentAnom;
  var fl = Math.min(23, Math.floor(hoursDone)), remHours = [];
  for (var h = fl + 1; h < 24; h++) remHours.push(h);
  var tToday = (sum(obs) + sum(remHours.map(function (hh) { return climoTemp(doyT, hh) + anomToday; }))) / (obs.length + remHours.length);

  var results = {}, totalMean = 0, totalToDate = 0, varSq = 0, parts = {};
  UTILS.forEach(function (util) {
    var pr = prior[util];
    if (!pr) { results[util] = { available: false }; return; }
    var model = fitModel(days, util, pr), a = model.a, b = model.b, sigma = model.sigma, wk = model.wk;
    var heating = pr[1] > 0, wh = hourWeights(util, heating);
    var doneCum = sum(days.map(function (d) { return d[util]; })), toDate = doneCum + today[util];
    var eh0 = expectedHdd(tToday, SIGMA_T * 0.5), pHeat = eh0[1];
    var dayPred = Math.max(0, (a + b * eh0[0]) * (today.dow >= 5 ? wk : 1));
    var fl0 = Math.floor(hoursDone);
    var fracDone = sum(wh.slice(0, fl0)) + wh[Math.min(23, fl0)] * (hoursDone - fl0);
    var fracRem = Math.max(0, 1 - fracDone), remToday = dayPred * fracRem;
    var future = [];
    for (var dd = todayN + 1, k = 1; dd <= dim; dd++, k++) {
      var di = dayInfo(y, m, dd), mu = defaultWeather(di.doy, k, recentAnom), eh = expectedHdd(mu), wf = di.dow >= 5 ? wk : 1;
      future.push({ day: dd, pred: Math.max(0, (a + b * eh[0]) * wf), slope: b * eh[1] * wf });
    }
    var rel = 0.04 + 0.10 * (N0 / (model.n + N0)), sensToday = b * pHeat * 0.5 * fracRem;
    var cumAt = function (dayIdx) {
      var fut = future.filter(function (f) { return f.day <= dayIdx; });
      var mean = toDate + remToday + sum(fut.map(function (f) { return f.pred; }));
      var remMean = mean - toDate, nEff = fracRem + fut.length;
      var se = fut.map(function (f) { return f.slope * SIGMA_T; }).concat([sensToday * SIGMA_T]);
      var s1 = sum(se), s2 = sum(se.map(function (s) { return s * s; }));
      var v = Math.pow(sigma * 1.15, 2) * nEff + 0.5 * s2 + 0.5 * s1 * s1 + Math.pow(rel * remMean, 2);
      return [mean, Math.sqrt(v)];
    };
    var ce = cumAt(dim), meanEnd = ce[0], sdEnd = ce[1];
    var lowEnd = Math.max(toDate, meanEnd - Z80 * sdEnd), highEnd = meanEnd + Z80 * sdEnd;
    var elapsed = (todayN - 1) + hoursDone / 24;
    var cTo = billTotal(util, toDate, elapsed), cMean = billTotal(util, meanEnd, dim), cLow = billTotal(util, lowEnd, dim), cHigh = billTotal(util, highEnd, dim);
    var res = { available: true, to_date: toDate, projected: meanEnd, low: lowEnd, high: highEnd,
      avg_daily_to_date: toDate / Math.max(1e-9, elapsed), expected_daily_rest: (meanEnd - toDate) / Math.max(1e-9, (dim - todayN) + fracRem),
      cost_to_date: cTo, projected_cost: cMean, cost_low: cLow, cost_high: cHigh,
      model: { a: a, b: b, sigma: sigma, days_used: model.n } };
    if (util === 'elec') {
      var bill = electricityBill(meanEnd, dim), t = TARIFFS.electricity;
      res.tier = { threshold_kwh: bill.threshold_kwh, tier2_kwh: bill.tier2_kwh, exceeds: bill.tier2_kwh > 0.5, extra_cost: bill.tier2_kwh * (t.tier2_price - t.tier1_price) * (1 + TAX_RATE) };
    }
    results[util] = res; totalToDate += cTo; totalMean += cMean; varSq += Math.pow((cHigh - cLow) / 2, 2);
    parts[util] = { toDate: toDate, cumAt: cumAt };
  });
  var half = Math.sqrt(varSq);
  var total = { cost_to_date: totalToDate, projected: totalMean, low: Math.max(totalToDate, totalMean - half), high: totalMean + half, half_width: half,
    last_month: lastTotal, vs_last_month_pct: lastTotal ? (totalMean / lastTotal - 1) * 100 : null };
  var curve = [];
  for (var d = 1; d <= dim; d++) {
    var actual = null, proj, lo = null, hi = null;
    if (d < todayN) {
      actual = 0;
      Object.keys(parts).forEach(function (util) { actual += billTotal(util, sum(days.slice(0, d).map(function (x) { return x[util]; })), d); });
      proj = actual;
    } else {
      proj = 0; var sq = 0;
      Object.keys(parts).forEach(function (util) {
        var pp = parts[util], r = pp.cumAt(d), c = billTotal(util, r[0], d);
        var cl = billTotal(util, Math.max(pp.toDate, r[0] - Z80 * r[1]), d), ch = billTotal(util, r[0] + Z80 * r[1], d);
        proj += c; sq += Math.pow(((c - cl) + (ch - c)) / 2, 2);
      });
      lo = Math.max(0, proj - Math.sqrt(sq)); hi = proj + Math.sqrt(sq);
    }
    curve.push({ day: d, actual: actual, projected: proj, low: lo, high: hi });
  }
  return { month: y + '-' + (m < 10 ? '0' : '') + m, days_in_month: dim, day: todayN, elapsed_days: (todayN - 1) + hoursDone / 24, confidence: 0.8, utilities: results, total: total, curve: curve };
}

/* ---- historique, forecast, live ---- */
var memoMonth = {};
function monthTotals(pk, y, m) {
  var key = pk + '|' + y + '|' + m;
  if (memoMonth[key]) return memoMonth[key];
  var p = PROFILES[pk], dim = daysInMonth(y, m), use = { elec: 0, gas: 0, water: 0 };
  for (var d = 1; d <= dim; d++) { var r = dayRecord(p, y, m, d); UTILS.forEach(function (u) { use[u] += r[u]; }); }
  var costs = {}, tot = 0;
  UTILS.forEach(function (u) { costs[u] = (u !== 'gas' || p.hasGas) ? billTotal(u, use[u], dim) : 0; tot += costs[u]; });
  return (memoMonth[key] = { month: y + '-' + (m < 10 ? '0' : '') + m, days: dim, usage: use, costs: costs, total: tot, tier2_kwh: electricityBill(use.elec, dim).tier2_kwh });
}
function history(pk, now, months) {
  var out = [];
  for (var i = months; i >= 1; i--) { var s = shiftMonth(now.y, now.m, -i); out.push(monthTotals(pk, s.y, s.m)); }
  return out;
}
function snapshot(pk, now) {
  var p = PROFILES[pk], days = [];
  for (var d = 1; d < now.d; d++) days.push(dayRecord(p, now.y, now.m, d));
  var today = partialDay(p, now.y, now.m, now.d, now.h, now.mi, now.s);
  return { days: days, today: today, cur: today.current };
}
function forecast(pk, now, includeTruth) {
  var sn = snapshot(pk, now), pm = shiftMonth(now.y, now.m, -1), last = monthTotals(pk, pm.y, pm.m);
  var f = buildForecast(pk, now.y, now.m, now.d, sn.days, sn.today, last.total);
  f.profile = pk; f.last_month = { month: last.month, total: last.total, usage: last.usage };
  if (includeTruth) {
    var p = PROFILES[pk], truth = monthTotals(pk, now.y, now.m), cum = { elec: 0, gas: 0, water: 0 }, series = [];
    for (var d = 1; d <= truth.days; d++) {
      var r = dayRecord(p, now.y, now.m, d), tot = 0;
      UTILS.forEach(function (u) { cum[u] += r[u]; if (u === 'gas' && !p.hasGas) return; tot += billTotal(u, cum[u], d); });
      series.push({ day: d, cost: tot });
    }
    f.truth = { total: truth.total, usage: truth.usage, curve: series };
  }
  return f;
}
function live(pk, now) {
  var p = PROFILES[pk], sn = snapshot(pk, now), f = forecast(pk, now, false), today = sn.today, cur = sn.cur;
  var done = {}, after = {}, brk = {}, cost = 0;
  UTILS.forEach(function (u) { done[u] = sum(sn.days.map(function (d) { return d[u]; })); after[u] = done[u] + today[u]; });
  var before = now.d - 1, afterDays = before + today.hours / 24;
  UTILS.forEach(function (u) { if (u === 'gas' && !p.hasGas) { brk[u] = 0; return; } brk[u] = billTotal(u, after[u], afterDays) - billTotal(u, done[u], before); cost += brk[u]; });
  var thr = TARIFFS.electricity.tier1_kwh_per_day * afterDays;
  return { profile: pk, source: 'simulation', temperature_c: cur.t,
    now: { elec_kw: cur.elec, gas_m3h: cur.gas, water_lpm: cur.water / 60 },
    today: { elec_kwh: today.elec, gas_m3: today.gas, water_m3: today.water, cost: cost, cost_by_utility: brk },
    month_to_date: { elec_kwh: after.elec, gas_m3: after.gas, water_m3: after.water, cost: f.total.cost_to_date, days_elapsed: afterDays },
    tier: { current: after.elec > thr ? 2 : 1, kwh_to_date: after.elec, threshold_kwh_to_date: thr, price_now: marginalPrice(after.elec, afterDays), projected_exceeds: !!(f.utilities.elec.tier && f.utilities.elec.tier.exceeds) },
    forecast: { projected: f.total.projected, low: f.total.low, high: f.total.high, vs_last_month_pct: f.total.vs_last_month_pct }, has_gas: p.hasGas };
}

/* ---- logement personnalisé, tarifs modifiables ---- */
var DEFAULT_TARIFFS = JSON.parse(JSON.stringify(TARIFFS));
function r3(x) { return Math.round(x * 1000) / 1000; }
function defaultTariffInputs() {
  var d = DEFAULT_TARIFFS, gv = 0, k;
  for (k in d.gas.components_per_m3) gv += d.gas.components_per_m3[k];
  return { t1: r3(d.electricity.tier1_price * 100), t2: r3(d.electricity.tier2_price * 100), thr: d.electricity.tier1_kwh_per_day,
    access: r3(d.electricity.access_fee_per_day * 100), gasvar: r3(gv * 100), gasbase: d.gas.base_fee_per_day, water: d.water.per_m3 };
}
function resetTariffs() {
  var d = JSON.parse(JSON.stringify(DEFAULT_TARIFFS));
  ['electricity', 'gas', 'water'].forEach(function (k) { Object.keys(TARIFFS[k]).forEach(function (f) { delete TARIFFS[k][f]; }); Object.keys(d[k]).forEach(function (f) { TARIFFS[k][f] = d[k][f]; }); });
  memoMonth = {};
}
function setTariffs(t) {
  resetTariffs();
  var e = TARIFFS.electricity;
  e.tier1_price = t.t1 / 100; e.tier2_price = t.t2 / 100; e.tier1_kwh_per_day = t.thr; e.access_fee_per_day = t.access / 100;
  TARIFFS.gas.components_per_m3 = { personnalise: t.gasvar / 100 }; TARIFFS.gas.base_fee_per_day = t.gasbase;
  TARIFFS.water.per_m3 = t.water;
  memoMonth = {};
}
function registerCustom(o) {
  var people = Math.max(1, Math.min(10, Math.round(+o.people || 1))), house = !!o.house;
  var heat = o.heat === 'elec' ? 'elec' : 'gas', dhw = o.dhw === 'elec' ? 'elec' : 'gas', ac = !!o.ac;
  var key = 'perso-' + people + (house ? 'h' : 'a') + heat + dhw + (ac ? 'c' : 'n');
  if (PROFILES[key]) return key;
  var p = { key: key, seed: 44, label: 'Mon logement', short: 'Mon logement', description: 'Logement personnalisé', people: people,
    elecBase: house ? 4.5 + 5 * people : 2 + 3.7 * people,
    dhwElec: dhw === 'elec' ? 2 * people : 0,
    heatElec: heat === 'elec' ? (house ? 0.68 : 0.5) * people : 0,
    hasGas: heat === 'gas' || dhw === 'gas',
    gasDhw: dhw === 'gas' ? 0.31 * people : (heat === 'gas' ? 0.1 : 0),
    gasHeat: heat === 'gas' ? (house ? 0.10 : 0.07) * people : 0, ac: ac, house: house };
  PROFILES[key] = p;
  PRIORS[key] = { elec: [(p.elecBase + p.dhwElec) * 0.92, p.heatElec * 0.85], gas: p.hasGas ? [Math.max(0.3, p.gasDhw * 0.85), p.gasHeat * 0.85] : null, water: [0.24 * people, 0] };
  return key;
}
function num(v) { var x = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(x) && x >= 0 ? x : null; }
/* Prévision à partir des relevés « depuis le 1er du mois » saisis par la personne.
   Ce qui n'est pas saisi est estimé d'après le type de logement. */
function forecastMine(o, now) {
  var pk = registerCustom(o), p = PROFILES[pk], sn = snapshot(pk, now), used = [];
  var elapsed = (now.d - 1) + (now.h * 3600 + now.mi * 60 + now.s) / 86400;
  var days = sn.days.map(function (d) { var c = {}; for (var k in d) c[k] = d[k]; c.tmean = tNormal(d.doy); return c; });
  var today = {}; for (var k in sn.today) today[k] = sn.today[k];
  today.temps = sn.today.temps.map(function (t, h) { return climoTemp(sn.today.doy, h); });
  UTILS.forEach(function (u) {
    var v = num(o[u]);
    if (v === null || (u === 'gas' && !p.hasGas) || elapsed < 0.02) return;
    var r = v / elapsed;
    days.forEach(function (d) { d[u] = r; });
    today[u] = r * (today.hours / 24);
    used.push(u);
  });
  var last = num(o.lastBill); if (!(last > 0)) last = null;
  var f = buildForecast(pk, now.y, now.m, now.d, days, today, last);
  f.profile = pk; f.custom = true; f.used = used; f.last_month = last ? { month: null, total: last } : null;
  return f;
}
function nowLocal() {
  var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  var get = function (t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return +parts[i].value; return 0; };
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}
root.VoltixEngine = { PROFILES: PROFILES, TARIFFS: TARIFFS, forecast: forecast, live: live, history: history, monthTotals: monthTotals, daysInMonth: daysInMonth, nowLocal: nowLocal, gasPrice: gasPrice, dayInfo: dayInfo, forecastMine: forecastMine, registerCustom: registerCustom, setTariffs: setTariffs, resetTariffs: resetTariffs, defaultTariffInputs: defaultTariffInputs };
})(typeof window !== 'undefined' ? window : this);

/* ========================= APPLICATION ========================= */
(function () {
'use strict';
var E = window.VoltixEngine;
var $ = function (s, el) { return (el || document).querySelector(s); };
var NF = function (min, max) { return new Intl.NumberFormat('fr-CA', { minimumFractionDigits: min, maximumFractionDigits: max }); };
var n0 = NF(0, 0), n1 = NF(1, 1), n2 = NF(2, 2), n3 = NF(3, 3);
var m0 = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
var m2 = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

/* ---------- état et mémoire du navigateur ---------- */
var KEY = 'voltix.mine.v1';
var DEFAULT_MINE = { people: 4, house: true, heat: 'gas', dhw: 'gas', ac: true, elec: '', gas: '', water: '', tariffs: null };
function loadMine() {
  try { var s = window.localStorage.getItem(KEY); if (s) return Object.assign({}, DEFAULT_MINE, JSON.parse(s)); } catch (e) {}
  return Object.assign({}, DEFAULT_MINE);
}
function saveMine() { try { window.localStorage.setItem(KEY, JSON.stringify(state.mine)); } catch (e) {} }
var state = { view: 'demo', profile: 'maison_gaz', mode: 'demo', day: null, truth: false, tariffs: E.TARIFFS, today: E.nowLocal(), booted: false, mine: loadMine() };
var seq = 0, applied = 'default';

function applyTariffs() {
  var want = (state.view === 'mine' && state.mine.tariffs) ? JSON.stringify(state.mine.tariffs) : 'default';
  if (want === applied) return;
  applied = want;
  if (want === 'default') E.resetTariffs(); else E.setTariffs(state.mine.tariffs);
}

/* ---------- accès aux données : API Python d'abord, moteur intégré sinon ---------- */
function apiGet(path) {
  if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
  var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 4000);
  return fetch(path, { signal: c.signal, headers: { accept: 'application/json' } }).then(function (r) {
    clearTimeout(t);
    var ct = r.headers.get('content-type') || '';
    if (!r.ok || ct.indexOf('json') < 0) throw new Error('api');
    return r.json();
  }, function (e) { clearTimeout(t); throw e; });
}
function atParam(o) { var p = function (x) { return (x < 10 ? '0' : '') + x; }; return o.y + '-' + p(o.m) + '-' + p(o.d) + 'T' + p(o.h) + ':' + p(o.mi) + ':' + p(o.s); }
function useDemo() { state.mode = 'demo'; setChip(); }
function mineLive(f) {
  var U = f.utilities, thr = E.TARIFFS.electricity.tier1_kwh_per_day * f.elapsed_days, g = U.gas.available;
  return { mtd: true, has_gas: g,
    avg: { elec: U.elec.avg_daily_to_date, gas: g ? U.gas.avg_daily_to_date : 0, water: U.water.avg_daily_to_date },
    today: { water_m3: U.water.to_date, gas_m3: g ? U.gas.to_date : 0, elec_kwh: U.elec.to_date, cost: f.total.cost_to_date },
    tier: { current: U.elec.to_date > thr ? 2 : 1 },
    forecast: { projected: f.total.projected, low: f.total.low, high: f.total.high } };
}
function getLive() {
  applyTariffs();
  if (state.view === 'mine') return Promise.resolve(mineLive(E.forecastMine(state.mine, E.nowLocal())));
  if (state.mode === 'api') return apiGet('/api/live?profile=' + state.profile).catch(function () { useDemo(); return E.live(state.profile, E.nowLocal()); });
  return Promise.resolve(E.live(state.profile, E.nowLocal()));
}
function getForecast(at, truth) {
  applyTariffs();
  if (state.view === 'mine') return Promise.resolve(E.forecastMine(state.mine, E.nowLocal()));
  if (state.mode === 'api') return apiGet('/api/forecast?profile=' + state.profile + '&at=' + atParam(at) + (truth ? '&truth=true' : '')).catch(function () { useDemo(); return E.forecast(state.profile, at, truth); });
  return Promise.resolve(E.forecast(state.profile, at, truth));
}
function getHistory() {
  if (state.mode === 'api') return apiGet('/api/history?profile=' + state.profile + '&months=6').catch(function () { useDemo(); return E.history(state.profile, E.nowLocal(), 6); });
  return Promise.resolve(E.history(state.profile, E.nowLocal(), 6));
}
function setChip() {
  var c = $('#chip');
  c.className = 'chip' + (state.mode === 'api' ? '' : ' demo');
  c.lastChild.textContent = state.mode === 'api' ? 'Source : API du prototype' : 'Démo : données simulées dans le navigateur';
}

/* ---------- panneau en direct ---------- */
function countUp(el, to, fmt, suffix) {
  if (reduceMotion || state.booted) { el.innerHTML = fmt(to) + suffix; return; }
  var t0 = performance.now(), dur = 900;
  (function step(t) {
    var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.innerHTML = fmt(to * e) + suffix;
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function renderScreen(L) {
  var now = E.nowLocal(), mtd = !!L.mtd;
  var clock = $('#s-clock');
  clock.textContent = new Intl.DateTimeFormat('fr-CA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Toronto', hourCycle: 'h23'
  }).format(new Date());
  clock.dateTime = new Date().toISOString();
  var live = $('.live');
  live.classList.toggle('demo', state.mode !== 'api');
  $('#s-title').textContent = state.mode !== 'api'
    ? (state.view === 'mine' ? 'Estimation personnalisée' : 'Démonstration simulée')
    : (mtd ? 'Depuis le 1er du mois' : 'Données reçues');
  var source = $('#s-source');
  source.className = 'live-disclaimer' + (state.mode === 'api' ? ' api' : ' demo');
  source.textContent = state.mode === 'api'
    ? 'Données fournies par l’API du prototype'
    : (state.view === 'mine'
      ? 'Estimation selon vos informations · aucun capteur connecté'
      : 'Données simulées · aucun compteur connecté');
  $('#s-cost-lbl').textContent = mtd ? 'Coût cumulé ce mois' : 'Coût cumulé aujourd’hui';
  countUp($('#s-water'), L.today.water_m3, function (v) { return n2.format(v); }, '&nbsp;<span>m³</span>');
  $('#s-water-rate').textContent = mtd ? n1.format(L.avg.water) + ' m³ par jour en moyenne' : n1.format(L.now.water_lpm) + ' L/min en ce moment';
  $('#s-gas-row').style.display = L.has_gas ? '' : 'none';
  if (L.has_gas) {
    countUp($('#s-gas'), L.today.gas_m3, function (v) { return n2.format(v); }, '&nbsp;<span>m³</span>');
    $('#s-gas-rate').textContent = mtd ? n2.format(L.avg.gas) + ' m³ par jour en moyenne' : n2.format(L.now.gas_m3h) + ' m³/h en ce moment';
  }
  countUp($('#s-elec'), L.today.elec_kwh, function (v) { return n1.format(v); }, '&nbsp;<span>kWh</span>');
  $('#s-elec-rate').textContent = mtd ? n1.format(L.avg.elec) + ' kWh par jour en moyenne' : n2.format(L.now.elec_kw) + ' kW en ce moment';
  $('#s-cost').textContent = m2.format(L.today.cost);
  $('#s-tier').textContent = L.tier.current === 1 ? '1er' : '2e';
  $('#s-est').textContent = '≈ ' + m0.format(L.forecast.projected);
  $('#s-est-range').textContent = 'Facture à ce jour : ' + m0.format(mtd ? L.today.cost : L.month_to_date.cost) + ' · entre ' + m0.format(L.forecast.low) + ' et ' + m0.format(L.forecast.high);
  $('#s-profile').textContent = state.view === 'mine'
    ? 'Estimation calculée à partir de vos informations.'
    : E.PROFILES[state.profile].label + ' · exemple de consommation et coûts estimés.';
  state.booted = true;
}
function refreshLive() { getLive().then(renderScreen); }
function drawSpark(f) {
  var svg = $('#s-spark'); if (!svg) return;
  var W = 300, H = 58, dim = f.days_in_month, ymax = f.total.high * 1.05, today = f.day, el = f.elapsed_days, cTo = f.total.cost_to_date;
  var X = function (d) { return 4 + (d / dim) * (W - 8); }, Y = function (v) { return H - 6 - (v / ymax) * (H - 14); };
  var act = [[0, 0]], pr = [[el, cTo]], band = [[el, cTo]], low = [];
  f.curve.forEach(function (c) { if (c.actual != null) act.push([c.day, c.actual]); if (c.day >= today) { pr.push([c.day, c.projected]); band.push([c.day, c.high]); low.push([c.day, c.low]); } });
  act.push([el, cTo]); low.reverse().forEach(function (p) { band.push(p); });
  var P = function (a) { return a.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' '); };
  svg.innerHTML = '<polygon points="' + P(band) + '" fill="rgba(11,11,12,.09)"/>' +
    '<polyline fill="none" stroke="#0b0b0c" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + P(act) + '"/>' +
    '<polyline fill="none" stroke="#0b0b0c" stroke-width="2.5" stroke-dasharray="5 4" stroke-linecap="round" points="' + P(pr) + '"/>' +
    '<circle cx="' + X(el).toFixed(1) + '" cy="' + Y(cTo).toFixed(1) + '" r="3.5" fill="#0b0b0c"/>';
}

/* ---------- prévisions ---------- */
function dateLabel(o, withTime) {
  var dt = new Date(Date.UTC(o.y, o.m - 1, o.d, 12));
  var s = new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dt);
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s + (withTime ? ' — ' + o.h + ' h ' + (o.mi < 10 ? '0' : '') + o.mi : ' — midi');
}
function selectedAt() {
  var t = state.today, d = state.day || t.d;
  return d === t.d ? E.nowLocal() : { y: t.y, m: t.m, d: d, h: 12, mi: 0, s: 0 };
}
function setUtil(prefix, u, unitFmt, unit) {
  var box = $('#k-' + prefix + '-box');
  if (box) box.style.display = u.available ? '' : 'none';
  if (!u.available) return;
  $('#k-' + prefix).innerHTML = unitFmt(u.projected) + '&nbsp;<span>' + unit + '</span>';
  $('#k-' + prefix + '-c').innerHTML = 'À ce jour : ' + unitFmt(u.to_date) + ' ' + unit + ' (' + m0.format(u.cost_to_date) + ')<br>Fin de mois : ≈ ' + m0.format(u.projected_cost) + ', entre ' + unitFmt(u.low) + ' et ' + unitFmt(u.high) + ' ' + unit;
}
function renderForecast(f) {
  var T = f.total, mine = state.view === 'mine';
  $('#k-total').textContent = '≈ ' + m0.format(T.projected);
  $('#k-range').textContent = 'Entre ' + m0.format(T.low) + ' et ' + m0.format(T.high) + ' dans 80 % des cas';
  var el0 = f.elapsed_days, dim0 = f.days_in_month, tu = f.utilities, parts = [n0.format(tu.elec.to_date) + ' kWh'];
  if (tu.gas.available) parts.push(n1.format(tu.gas.to_date) + ' m³ de gaz');
  parts.push(n1.format(tu.water.to_date) + ' m³ d’eau');
  $('#k-todate').textContent = m2.format(T.cost_to_date);
  $('#k-todate-c').textContent = 'Depuis le 1er, en ' + n1.format(el0) + ' jours : ' + parts.join(', ') + '.';
  $('#k-pace').textContent = 'Rythme actuel : ' + n1.format(tu.elec.avg_daily_to_date) + ' kWh' + (tu.gas.available ? ', ' + n2.format(tu.gas.avg_daily_to_date) + ' m³ de gaz' : '') + ', ' + n2.format(tu.water.avg_daily_to_date) + ' m³ d’eau par jour.';
  var pt = Math.min(100, el0 / dim0 * 100), pb = Math.min(100, T.cost_to_date / T.projected * 100);
  $('#pg-t').style.width = pt + '%'; $('#pg-b').style.width = pb + '%';
  $('#pg-t-l').textContent = n1.format(el0) + ' jours sur ' + dim0 + ' : ' + n0.format(pt) + ' % du mois écoulé';
  $('#pg-b-l').textContent = m0.format(T.cost_to_date) + ' sur ≈ ' + m0.format(T.projected) + ' : ' + n0.format(pb) + ' % de la facture';
  setUtil('water', f.utilities.water, function (v) { return n1.format(v); }, 'm³');
  setUtil('gas', f.utilities.gas, function (v) { return n0.format(v); }, 'm³');
  setUtil('elec', f.utilities.elec, function (v) { return n0.format(v); }, 'kWh');

  var bs = $('#basis');
  if (mine) {
    var names = { elec: 'électricité', gas: 'gaz', water: 'eau' }, used = f.used || [];
    bs.textContent = used.length ? 'Calculé avec vos relevés : ' + used.map(function (u) { return names[u]; }).join(', ') + '. Le reste est estimé d’après votre logement.' : 'Estimation d’après votre type de logement. Entrez vos relevés pour la préciser.';
  } else bs.textContent = 'Exemple simulé — ' + E.PROFILES[state.profile].description + '.';

  var vs = $('#k-vs');
  if (T.vs_last_month_pct != null) {
    var pc = T.vs_last_month_pct, lm = f.last_month ? f.last_month.total : T.last_month;
    vs.textContent = 'Le mois dernier, la facture était de ' + m0.format(lm) + ' : cette projection est ' + (Math.abs(pc) < 0.5 ? 'à peu près identique.' : (pc > 0 ? 'plus élevée de ' : 'plus basse de ') + n1.format(Math.abs(pc)) + ' %.');
  } else vs.textContent = '';

  var tn = $('#tiernote'), tier = f.utilities.elec.tier, t = (mine ? E.TARIFFS : state.tariffs).electricity;
  tn.hidden = false;
  if (tier && tier.exceeds) {
    tn.className = 'tiernote warn';
    tn.textContent = 'À ce rythme, vous dépasserez le seuil de ' + n0.format(t.tier1_kwh_per_day) + ' kWh par jour d’environ ' + n0.format(tier.tier2_kwh) + ' kWh ce mois-ci. Ces kWh sont facturés ' + n3.format(t.tier2_price * 100) + ' ¢ au lieu de ' + n3.format(t.tier1_price * 100) + ' ¢, soit ≈ ' + m0.format(tier.extra_cost) + ' de plus sur la facture.';
  } else if (tier) {
    tn.className = 'tiernote';
    tn.textContent = 'Vous devriez rester au 1er palier (' + n3.format(t.tier1_price * 100) + ' ¢/kWh) : il reste environ ' + n0.format(tier.threshold_kwh - f.utilities.elec.projected) + ' kWh de marge avant le seuil de ' + n0.format(t.tier1_kwh_per_day) + ' kWh par jour.';
  }
  drawChart(f);
  renderTariffs(mine ? E.TARIFFS : state.tariffs, mine && !!state.mine.tariffs);
  renderBill(f, mine ? E.TARIFFS : state.tariffs);
  if (!mine) $('#day-out').textContent = dateLabel(selectedAt(), (state.day || state.today.d) === state.today.d);
}

/* facture du mois, ligne par ligne, avec la grille Hydro-Québec (et Énergir, eau) */
function renderBill(f, t) {
  var dim = f.days_in_month, e = t.electricity, g = t.gas, w = t.water, U = f.utilities, TPS = 0.05, TVQ = 0.09975;
  var kwh = U.elec.projected, thr = e.tier1_kwh_per_day * dim, k1 = Math.min(kwh, thr), k2 = Math.max(0, kwh - thr);
  var e1 = k1 * e.tier1_price, e2 = k2 * e.tier2_price, acc = e.access_fee_per_day * dim, subE = e1 + e2 + acc;
  var grp = function (a) { return '<tr class="grp"><th colspan="2">' + a + '</th></tr>'; };
  var row = function (a, b, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + a + '</th><td>' + b + '</td></tr>'; };
  var rows = grp(e.provider + ' · électricité'), totE = subE * (1 + TPS + TVQ), total = totE;
  rows += row(n0.format(k1) + ' kWh au 1er palier (' + n3.format(e.tier1_price * 100) + ' ¢/kWh)', m2.format(e1));
  if (k2 > 0.5) rows += row(n0.format(k2) + ' kWh au 2e palier (' + n3.format(e.tier2_price * 100) + ' ¢/kWh)', m2.format(e2));
  rows += row('Frais d’accès au réseau (' + dim + ' jours × ' + n3.format(e.access_fee_per_day * 100) + ' ¢)', m2.format(acc));
  rows += row('TPS (5 %)', m2.format(subE * TPS));
  rows += row('TVQ (9,975 %)', m2.format(subE * TVQ));
  rows += row('Total électricité', m2.format(totE), 'tot');
  if (U.gas.available) {
    var gp = Object.keys(g.components_per_m3).reduce(function (s, k) { return s + g.components_per_m3[k]; }, 0);
    var gv = U.gas.projected * gp, gb = g.base_fee_per_day * dim, gs = gv + gb, totG = gs * (1 + TPS + TVQ);
    total += totG;
    rows += grp(g.provider + ' · gaz naturel');
    rows += row(n0.format(U.gas.projected) + ' m³ × ' + n1.format(gp * 100) + ' ¢/m³', m2.format(gv));
    rows += row('Frais de base (' + dim + ' jours × ' + m2.format(g.base_fee_per_day) + ')', m2.format(gb));
    rows += row('Taxes (TPS + TVQ)', m2.format(gs * (TPS + TVQ)));
    rows += row('Total gaz', m2.format(totG), 'tot');
  }
  var totW = U.water.projected * w.per_m3 + w.fixed_per_day * dim;
  total += totW;
  rows += grp('Eau');
  rows += row(n1.format(U.water.projected) + ' m³ × ' + m2.format(w.per_m3), m2.format(totW));
  rows += row('Total du mois', m2.format(total), 'tot big');
  $('#bill-table tbody').innerHTML = rows;
  $('#bill-sub').textContent = 'Consommation projetée : ' + n0.format(kwh) + ' kWh sur ' + dim + ' jours, au tarif ' + e.rate + ' d’Hydro-Québec, taxes incluses.';
}
function niceMax(v) { var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function drawChart(f) {
  var svg = $('#chart'), W = 760, H = 360, L = 54, R = 70, Tp = 22, B = 40, dim = f.days_in_month, today = f.day;
  var maxV = Math.max(f.total.high, f.truth ? f.truth.total : 0) * 1.04, ymax = niceMax(maxV);
  var X = function (d) { return L + (d / dim) * (W - L - R); }, Y = function (v) { return H - B - (v / ymax) * (H - B - Tp); };
  var o = '', steps = 4;
  for (var i = 0; i <= steps; i++) { var v = ymax * i / steps, y = Y(v); o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + n0.format(v) + ' $</text>'; }
  for (var d = 1; d <= dim; d += (dim > 28 ? 5 : 4)) o += '<text x="' + X(d) + '" y="' + (H - 16) + '" text-anchor="middle">' + d + '</text>';
  o += '<text x="' + X(dim) + '" y="' + (H - 16) + '" text-anchor="middle">' + dim + '</text>';
  var elapsed = f.elapsed_days, cTo = f.total.cost_to_date;
  var band = [[X(elapsed), Y(cTo)]], lower = [];
  f.curve.forEach(function (c) { if (c.day >= today) { band.push([X(c.day), Y(c.high)]); lower.push([X(c.day), Y(c.low)]); } });
  lower.reverse().forEach(function (p) { band.push(p); }); band.push([X(elapsed), Y(cTo)]);
  o += '<polygon points="' + band.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="var(--band)"/>';
  if (f.truth) o += '<polyline fill="none" stroke="var(--truth)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" points="' + [[0, 0]].concat(f.truth.curve.map(function (c) { return [c.day, c.cost]; })).map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + '"/>';
  var act = [[0, 0]]; f.curve.forEach(function (c) { if (c.actual != null) act.push([c.day, c.actual]); }); act.push([elapsed, cTo]);
  var pr = [[elapsed, cTo]]; f.curve.forEach(function (c) { if (c.day >= today) pr.push([c.day, c.projected]); });
  var pts = function (a) { return a.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' '); };
  o += '<polyline fill="none" stroke="var(--text)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts(act) + '"/>';
  o += '<polyline fill="none" stroke="var(--text)" stroke-width="3.5" stroke-dasharray="9 7" stroke-linecap="round" points="' + pts(pr) + '"/>';
  o += '<line x1="' + X(elapsed) + '" x2="' + X(elapsed) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="var(--text)" stroke-width="1" opacity=".4"/>';
  o += '<circle cx="' + X(elapsed) + '" cy="' + Y(cTo) + '" r="6" fill="var(--text)"/>';
  o += '<text x="' + (X(elapsed) + (elapsed > dim * 0.7 ? -8 : 8)) + '" y="' + (Tp + 10) + '" text-anchor="' + (elapsed > dim * 0.7 ? 'end' : 'start') + '" style="fill:var(--text);font-weight:600">Jour ' + today + '</text>';
  o += '<circle cx="' + X(dim) + '" cy="' + Y(f.total.projected) + '" r="6" fill="var(--text)"/>';
  o += '<text x="' + (X(dim) + 10) + '" y="' + (Y(f.total.projected) + 5) + '" style="fill:var(--text);font-weight:600;font-size:15px">≈ ' + n0.format(f.total.projected) + ' $</text>';
  o += '<line id="cursor" x1="0" x2="0" y1="' + Tp + '" y2="' + (H - B) + '" stroke="var(--text)" stroke-width="1" stroke-dasharray="3 4" opacity="0"/>';
  svg.innerHTML = o;
  svg._f = f; svg._X = X; svg._dim = dim;
  $('#legend').innerHTML =
    '<span><svg viewBox="0 0 26 10"><line x1="0" y1="5" x2="26" y2="5" stroke="var(--text)" stroke-width="3.5"/></svg>Réel jusqu’à aujourd’hui</span>' +
    '<span><svg viewBox="0 0 26 10"><line x1="0" y1="5" x2="26" y2="5" stroke="var(--text)" stroke-width="3.5" stroke-dasharray="7 5"/></svg>Projection</span>' +
    '<span><svg viewBox="0 0 26 10"><rect width="26" height="10" fill="var(--band)"/></svg>Intervalle à 80 %</span>' +
    (f.truth ? '<span><svg viewBox="0 0 26 10"><line x1="0" y1="5" x2="26" y2="5" stroke="var(--truth)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/></svg>Réel simulé du mois complet</span>' : '');
  setReadout(null);
}
function setReadout(day) {
  var svg = $('#chart'), f = svg._f, ro = $('#readout'), cur = $('#cursor');
  if (!f) return;
  if (day == null) {
    if (cur) cur.setAttribute('opacity', '0');
    ro.textContent = 'Fin du mois : ≈ ' + m0.format(f.total.projected) + ' (' + m0.format(f.total.low) + ' à ' + m0.format(f.total.high) + ')' + (f.truth ? ' · réel simulé : ' + m0.format(f.truth.total) : '');
    return;
  }
  var c = f.curve[day - 1];
  cur.setAttribute('x1', svg._X(day)); cur.setAttribute('x2', svg._X(day)); cur.setAttribute('opacity', '.7');
  ro.textContent = c.actual != null ? 'Jour ' + day + ' : ' + m0.format(c.actual) + ' (réel)' : 'Jour ' + day + ' : ≈ ' + m0.format(c.projected) + ' (' + m0.format(c.low) + ' à ' + m0.format(c.high) + ')';
}
function wireChart() {
  var svg = $('#chart');
  var move = function (ev) {
    var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * 760;
    if (!svg._f) return;
    var d = Math.round((x - 54) / (760 - 54 - 70) * svg._dim);
    setReadout(Math.min(svg._dim, Math.max(1, d)));
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', function () { setReadout(null); });
}

/* ---------- tarifs et historique ---------- */
function renderTariffs(t, custom) {
  var e = t.electricity, g = t.gas, w = t.water, gp = Object.keys(g.components_per_m3).reduce(function (s, k) { return s + g.components_per_m3[k]; }, 0);
  var tagE = custom ? 'Personnalisé' : 'Officiel', tagG = custom ? 'Personnalisé' : 'Estimé', tagW = custom ? 'Personnalisé' : 'Illustratif';
  var rows = '';
  rows += '<tr class="grp"><th colspan="2">Électricité · ' + e.provider + ', ' + e.label + '<span class="tag">' + tagE + '</span></th></tr>';
  rows += '<tr><th>1er palier — jusqu’à ' + n0.format(e.tier1_kwh_per_day) + ' kWh/jour</th><td>' + n3.format(e.tier1_price * 100) + ' ¢/kWh</td></tr>';
  rows += '<tr><th>2e palier — au-delà de ' + n0.format(e.tier1_kwh_per_day) + ' kWh/jour</th><td>' + n3.format(e.tier2_price * 100) + ' ¢/kWh</td></tr>';
  rows += '<tr><th>Frais d’accès quotidien</th><td>' + n3.format(e.access_fee_per_day * 100) + ' ¢/jour</td></tr>';
  rows += '<tr class="grp"><th colspan="2">Gaz naturel · ' + g.provider + ', ' + g.label + '<span class="tag">' + tagG + '</span></th></tr>';
  rows += '<tr><th>Frais de base</th><td>' + m2.format(g.base_fee_per_day) + '/jour</td></tr>';
  rows += '<tr><th>Gaz, transport, équilibrage, distribution, SPEDE</th><td>' + n1.format(gp * 100) + ' ¢/m³</td></tr>';
  rows += '<tr class="grp"><th colspan="2">Eau · ' + w.label + '<span class="tag">' + tagW + '</span></th></tr>';
  rows += '<tr><th>Tarif au compteur</th><td>' + m2.format(w.per_m3) + '/m³</td></tr>';
  rows += '<tr class="grp"><th colspan="2">Taxes</th></tr>';
  rows += '<tr><th>TPS 5 % + TVQ 9,975 % sur l’électricité et le gaz</th><td>14,975 %</td></tr>';
  $('#tariff-table tbody').innerHTML = rows;
}
function renderHistory(hist, proj) {
  var svg = $('#hist'), W = 380, H = 250, L = 8, B = 34, Tp = 26, n = hist.length + 1;
  var vals = hist.map(function (h) { return h.total; }).concat([proj]), max = Math.max.apply(null, vals) * 1.15;
  var bw = (W - L * 2) / n, o = '';
  vals.forEach(function (v, i) {
    var h = (v / max) * (H - B - Tp), x = L + i * bw + bw * 0.14, w = bw * 0.72, y = H - B - h, cur = i === n - 1;
    o += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" ' + (cur ? 'fill="none" stroke="var(--text)" stroke-width="2" stroke-dasharray="6 4"' : 'fill="var(--text)"') + '/>';
    o += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" text-anchor="middle" style="fill:var(--text);font-weight:600">' + (cur ? '≈ ' : '') + n0.format(v) + ' $</text>';
    var mon = cur ? state.today.m : hist[i].month.slice(5) * 1;
    o += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + MONTHS[mon - 1].slice(0, 4) + (MONTHS[mon - 1].length > 4 ? '.' : '') + '</text>';
  });
  o += '<line x1="' + L + '" x2="' + (W - L) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line)"/>';
  svg.innerHTML = o;
}

/* ---------- vue « exemple » ---------- */
function buildProfiles() {
  var seg = $('#seg-prof');
  ['maison_gaz', 'condo_elec', 'maison_elec'].forEach(function (k) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = E.PROFILES[k].short; b.dataset.k = k;
    b.setAttribute('aria-pressed', k === state.profile ? 'true' : 'false');
    b.addEventListener('click', function () { state.profile = k; state.booted = false; Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute('aria-pressed', x.dataset.k === k ? 'true' : 'false'); }); refreshAll(); });
    seg.appendChild(b);
  });
}
var debounce;
function refreshForecast() {
  var id = ++seq, at = selectedAt();
  return getForecast(at, state.truth).then(function (f) { if (id === seq) renderForecast(f); });
}
function refreshAll() {
  refreshLive(); refreshForecast();
  if (state.view === 'demo') {
    getHistory().then(function (h) { getForecast(E.nowLocal(), false).then(function (f) { renderHistory(h, f.total.projected); drawSpark(f); }); });
  } else getForecast(E.nowLocal(), false).then(drawSpark);
}

/* ---------- vue « mon logement » ---------- */
var TIDS = { t1: 't-t1', t2: 't-t2', thr: 't-thr', access: 't-access', gasvar: 't-gasvar', gasbase: 't-gasbase', water: 't-water' };
function setRadio(name, val) { var r = document.querySelector('#ctl-mine input[name="' + name + '"][value="' + val + '"]'); if (r) r.checked = true; }
function getRadio(name) { var r = document.querySelector('#ctl-mine input[name="' + name + '"]:checked'); return r ? r.value : null; }
function hasGas(m) { return m.heat === 'gas' || m.dhw === 'gas'; }
function fillMine() {
  var m = state.mine, d = E.defaultTariffInputs(), t = m.tariffs || d;
  $('#m-people').textContent = m.people;
  setRadio('house', m.house ? 'h' : 'a'); setRadio('heat', m.heat); setRadio('dhw', m.dhw); setRadio('ac', m.ac ? 'y' : 'n');
  $('#m-elec').value = m.elec; $('#m-gas').value = m.gas; $('#m-water').value = m.water;
  Object.keys(TIDS).forEach(function (k) { $('#' + TIDS[k]).value = t[k]; });
  $('#m-gas-box').hidden = !hasGas(m);
}
function readMine() {
  var m = state.mine, d = E.defaultTariffInputs(), t = {}, changed = false;
  m.people = Math.max(1, Math.min(10, +$('#m-people').textContent || 1));
  m.house = getRadio('house') === 'h'; m.heat = getRadio('heat') || 'gas'; m.dhw = getRadio('dhw') || 'gas'; m.ac = getRadio('ac') === 'y';
  m.elec = $('#m-elec').value; m.gas = $('#m-gas').value; m.water = $('#m-water').value;
  Object.keys(TIDS).forEach(function (k) {
    var v = parseFloat($('#' + TIDS[k]).value);
    if (!isFinite(v) || v < 0 || (k === 'thr' && v < 1)) v = d[k];
    t[k] = v; if (Math.abs(v - d[k]) > 1e-9) changed = true;
  });
  m.tariffs = changed ? t : null;
  $('#m-gas-box').hidden = !hasGas(m);
}
function onMineChange() { readMine(); saveMine(); clearTimeout(debounce); debounce = setTimeout(refreshAll, 140); }
function wireMine() {
  var form = $('#ctl-mine');
  form.addEventListener('input', onMineChange); form.addEventListener('change', onMineChange);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  var step = function (d) { var el = $('#m-people'); el.textContent = Math.max(1, Math.min(10, (+el.textContent || 1) + d)); onMineChange(); };
  $('#p-minus').addEventListener('click', function () { step(-1); });
  $('#p-plus').addEventListener('click', function () { step(1); });
  $('#t-reset').addEventListener('click', function () { state.mine.tariffs = null; fillMine(); saveMine(); refreshAll(); });
}
function setView(v) {
  state.view = v; state.booted = false;
  $('#mode-demo').setAttribute('aria-pressed', v === 'demo' ? 'true' : 'false');
  $('#mode-mine').setAttribute('aria-pressed', v === 'mine' ? 'true' : 'false');
  $('#ctl-demo').hidden = v !== 'demo'; $('#ctl-mine').hidden = v !== 'mine';
  $('#hist-card').hidden = v !== 'demo'; $('#split').classList.toggle('one', v !== 'demo');
  refreshAll();
}

/* ---------- démarrage ---------- */
function init() {
  buildProfiles(); wireChart(); wireMine(); fillMine(); renderTariffs(state.tariffs, false);
  var t = state.today, dim = E.daysInMonth(t.y, t.m), day = $('#day');
  day.max = dim; day.value = t.d; state.day = t.d;
  day.addEventListener('input', function () { state.day = +day.value; $('#day-out').textContent = dateLabel(selectedAt(), state.day === state.today.d); clearTimeout(debounce); debounce = setTimeout(refreshForecast, 120); });
  $('#truth').addEventListener('change', function (e) { state.truth = e.target.checked; refreshForecast(); });
  $('#mode-demo').addEventListener('click', function () { setView('demo'); });
  $('#mode-mine').addEventListener('click', function () { setView('mine'); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-goto-mine]'), function (a) { a.addEventListener('click', function () { setView('mine'); }); });
  apiGet('/api/health').then(function (h) { if (h && h.status === 'ok') { state.mode = 'api'; return apiGet('/api/tariffs').then(function (tf) { state.tariffs = tf; }); } })
    .catch(function () { state.mode = 'demo'; })
    .then(function () { setChip(); refreshAll(); setInterval(function () { if (!document.hidden) refreshLive(); }, 5000); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
