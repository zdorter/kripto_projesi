(function(root){
  'use strict';
  function qualifies(row, filters, now=Date.now()) {
    return row.valid && [row.tickTime,row.markTime].every(time=>Number.isFinite(time)&&now-time<=180000&&time-now<=10000) &&
      row.volume>=filters.volume*1e6 && row.change>0 && row.change>=filters.change && (filters.mode==='momentum' || (row.funding<0 && row.funding<=-filters.funding));
  }
  function assess(row, filters, metrics, interest, reference, now=Date.now()) {
    if(!row || !row.valid || now-row.tickTime>180000 || now-row.markTime>180000) return 'Veri eksik/eski · değerlendirilemedi';
    if(!qualifies(row,filters,now)) return 'Ön filtre koşulları bozuldu';
    if(Number.isFinite(reference)&&row.price<reference) return 'İlk izleme 5m dip referansı kaybedildi';
    if(!metrics || metrics.priceChange==null || metrics.volumeChange==null || !interest || interest.change==null) return 'İzleniyor · karşılaştırılabilir 15m veri bekleniyor';
    if(metrics.priceChange<=0) return 'Zayıflama · 15m fiyat yükselmiyor';
    if(metrics.volumeChange<0) return 'Zayıflama · 15m hacim önceki dönemin altında';
    return interest.change>0?'Fiyat ve hacim güçleniyor · OI artıyor':interest.change<0?'Fiyat ve hacim güçleniyor · OI azalıyor':'Fiyat ve hacim güçleniyor · OI yatay';
  }
  // Only an exact spot base-asset match is supported; multiplier contracts are never guessed.
  function spotSymbol(info, baseAsset) {
    return info?.symbols?.find(item=>item.baseAsset===baseAsset&&item.quoteAsset==='USDT'&&item.status==='TRADING'&&item.isSpotTradingAllowed!==false)?.symbol||null;
  }
  function premium(spot, future) {
    const bid=Number(spot?.bidPrice),ask=Number(spot?.askPrice),fBid=Number(future?.bidPrice),fAsk=Number(future?.askPrice);
    if(![bid,ask,fBid,fAsk].every(x=>Number.isFinite(x)&&x>0)||ask<bid||fAsk<fBid)throw Error('Geçersiz alış/satış fiyatı');
    return (((bid+ask)/2)/((fBid+fAsk)/2)-1)*100;
  }
  function positioning(rows, symbol, now=Date.now()) {
    if(!Array.isArray(rows)||!rows.length)throw Error('Oran verisi yok');
    const number=value=>value===null||value===undefined||value===''?NaN:Number(value);
    const latest=[...rows].sort((a,b)=>number(b.timestamp)-number(a.timestamp))[0];
    const time=number(latest.timestamp),long=number(latest.longAccount),short=number(latest.shortAccount),ratio=number(latest.longShortRatio);
    if(latest.symbol!==symbol||![time,long,short,ratio].every(Number.isFinite)||long<0||short<0||long>1||short>1||ratio<0||Math.abs(long+short-1)>0.01||now-time>600000||time>now+10000)throw Error('Oran verisi eski veya geçersiz');
    // API fields retain the same names on the position-size endpoint; labels must distinguish populations.
    return {long:long*100,short:short*100,ratio,time};
  }
  function positioningSummary(groups, threshold) {
    const names={general:'Genel hesaplar',topAccounts:'Büyük hesaplar',topPositions:'Büyük pozisyonlar'};
    const present=Object.keys(names).filter(key=>groups[key]);
    if(!present.length)return 'Konumlanma bilinmiyor';
    const short=present.filter(key=>groups[key].short>50&&groups[key].short>=threshold);
    return short.length?short.map(key=>names[key]+' short ağırlıklı').join(' · '):'Mevcut gruplarda short eşiği karşılanmadı';
  }
  const api={qualifies,assess,spotSymbol,premium,positioning,positioningSummary};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FuturesOpportunity=api;
})(globalThis);
