(function (root) {
  'use strict';
  const STEP = 300000;
  const numeric = value => value === null || value === undefined || value === '' ? NaN : Number(value);
  function fiveMinuteBars(rows, now = Date.now()) {
    if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row) || row.length < 8 || !Number.isFinite(numeric(row[0])) || !Number.isFinite(numeric(row[6])))) throw Error('5m mum yanıtı geçersiz');
    const bars = rows.filter(row => Array.isArray(row) && numeric(row[6]) < now).map(row => ({
      time: numeric(row[0]), end: numeric(row[6]), open: numeric(row[1]), high: numeric(row[2]),
      low: numeric(row[3]), close: numeric(row[4]), volume: numeric(row[7])
    })).sort((a, b) => a.time - b.time);
    if (bars.some((bar, i) => !Object.values(bar).every(Number.isFinite) || bar.open <= 0 || bar.close <= 0 ||
      bar.low <= 0 || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close) ||
      bar.volume < 0 || bar.end !== bar.time + STEP - 1 || bar.time % STEP !== 0 || (i && bars[i - 1].time === bar.time))) {
      throw Error('5m mum değerleri veya zaman damgaları geçersiz');
    }
    return bars;
  }
  function windowMetrics(rows, now = Date.now()) {
    const bars = fiveMinuteBars(rows, now);
    return [5, 15, 30].map(minutes => {
      const count = minutes / 5, recent = bars.slice(-count), previous = bars.slice(-2 * count, -count);
      const result = { minutes, priceChange: null, quoteVolume: null, volumeChange: null, start: null, end: null, reason: '', volumeReason: '' };
      const contiguous = list => list.every((bar, i) => !i || bar.time - list[i - 1].time === STEP);
      if (recent.length !== count || !contiguous(recent)) result.reason = 'Yeterli ardışık kapanmış mum yok';
      else if (now - recent.at(-1).end > STEP) result.reason = '5m mum verisi eski';
      else {
        result.start = recent[0].time; result.end = recent.at(-1).end;
        result.priceChange = (recent.at(-1).close / recent[0].open - 1) * 100;
        result.quoteVolume = recent.reduce((sum, bar) => sum + bar.volume, 0);
        if (previous.length !== count || !contiguous([...previous, ...recent])) result.volumeReason = 'Önceki eşit süre için yeterli mum yok';
        else {
          const baseline = previous.reduce((sum, bar) => sum + bar.volume, 0);
          if (baseline > 0) result.volumeChange = (result.quoteVolume / baseline - 1) * 100;
          else result.volumeReason = 'Önceki dönem hacmi sıfır';
        }
      }
      return result;
    });
  }
  function oiMetrics(rows, symbol, now = Date.now()) {
    if (!Array.isArray(rows)) throw Error('OI geçmişi yanıtı geçersiz');
    const points = rows.map(row => ({symbol: row.symbol, time: numeric(row.timestamp), value: numeric(row.sumOpenInterest)})).sort((a, b) => a.time - b.time);
    if (points.some((point, i) => point.symbol !== symbol || !Number.isFinite(point.time) || !Number.isFinite(point.value) || point.value < 0 || point.time % STEP !== 0 || point.time > now || (i && points[i-1].time === point.time))) throw Error('OI geçmişinde sembol/değer/zaman uyumsuzluğu');
    const last = points.at(-1);
    return [5, 15, 30].map(minutes => {
      const first = last && points.find(point => point.time === last.time - minutes * 60000);
      let reason = '';
      if (!last || now - last.time > 2 * STEP) reason = 'OI geçmişi eksik veya eski';
      else if (!first) reason = 'Karşılaştırılabilir OI örneği yok';
      else if (first.value <= 0) reason = 'Önceki OI sıfır';
      return { minutes, change: reason ? null : (last.value / first.value - 1) * 100,
        start: first?.time ?? null, end: last?.time ?? null, reason };
    });
  }
  const api = { fiveMinuteBars, windowMetrics, oiMetrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuturesDetail = api;
})(globalThis);
