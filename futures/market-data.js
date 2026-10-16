(function (root) {
  'use strict';
  function number(value) {
    if (value === null || value === undefined || value === '') return NaN;
    return Number(value);
  }
  function marketRows(info, tickers, premiums, now = Date.now()) {
    if (!Array.isArray(info?.symbols) || !Array.isArray(tickers) || !Array.isArray(premiums)) {
      throw new Error('Binance piyasa yanıtı beklenen biçimde değil');
    }
    const ticks = new Map(tickers.map(item => [item.symbol, item]));
    const marks = new Map(premiums.map(item => [item.symbol, item]));
    return info.symbols.filter(item => item.status === 'TRADING' && item.contractType === 'PERPETUAL' && item.quoteAsset === 'USDT')
      .map(item => {
        const tick = ticks.get(item.symbol), mark = marks.get(item.symbol);
        const row = { symbol: item.symbol, baseAsset: item.baseAsset,
          price: number(tick?.lastPrice), change: number(tick?.priceChangePercent),
          volume: number(tick?.quoteVolume), funding: number(mark?.lastFundingRate) * 100,
          tickTime: number(tick?.closeTime), markTime: number(mark?.time) };
        const finite = [row.price, row.change, row.volume, row.funding].every(Number.isFinite);
        const fresh = [row.tickTime, row.markTime].every(time => Number.isFinite(time) && now - time <= 180000 && time - now <= 10000);
        row.valid = finite && row.price > 0 && row.volume >= 0 && fresh;
        row.reason = !finite ? 'Eksik/geçersiz veri' : !fresh ? 'Eski/zamanı uyumsuz veri' : !row.valid ? 'Geçersiz fiyat/hacim' : '';
        return row;
      }).sort((a, b) => (Number.isFinite(b.volume) ? b.volume : -1) - (Number.isFinite(a.volume) ? a.volume : -1));
  }
  function matches(row, filters) {
    return row.valid && row.volume >= filters.volume * 1e6 &&
      Math.abs(row.change) >= filters.change && Math.abs(row.funding) >= filters.funding;
  }
  const api = { marketRows, matches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuturesMarket = api;
})(globalThis);
