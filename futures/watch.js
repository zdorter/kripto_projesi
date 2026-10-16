'use strict';
let watchEntries=new Map(),watchRun=0,spotInfo=null,watchBusy=false,watchResetPending=false;
function watchFilters(){return {volume:num('minVolume'),change:num('minChange'),funding:num('minFunding'),mode:$('scanMode').value}}
function cellRow(body,values,symbol){const tr=document.createElement('tr');if(symbol)tr.dataset.symbol=symbol;for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td)}body.append(tr)}
function renderWatch(){
 const body=$('watch-results');body.replaceChildren();
 for(const entry of watchEntries.values()){
  const stale=!entry.checkedAt||Date.now()-entry.checkedAt>180000;
  const data=entry.data;
 const positioningStale=Object.values(entry.positioning||{}).some(group=>Date.now()-group.time>600000);
  cellRow(body,[entry.symbol,utc(entry.firstSeen),fmt(entry.firstPrice,8),pct(entry.firstFunding),
   !stale&&data?pct(data.funding):'—',!stale&&data?pct(data.funding-entry.firstFunding)+' puan':'—',
   !stale?pct(entry.price?.priceChange):'—',!stale?pct(entry.price?.volumeChange):'—',!stale?pct(entry.oi?.change):'—',
   !stale?pct(entry.premium):'—',
   ...['general','topAccounts','topPositions'].map(key=>!stale&&entry.positioning?.[key]&&Date.now()-entry.positioning[key].time<=600000?pct(entry.positioning[key].short):'—'),
   stale?'—':positioningStale?'Konumlanma örneği eski':(entry.positioningText||'Konumlanma bekleniyor'),stale?'Veri eski/bekleniyor':entry.status,
   entry.oi?.end?utc(entry.oi.end):'—',entry.checkedAt?utc(entry.checkedAt):'—'],entry.symbol);
 }
 if(!watchEntries.size)cellRow(body,['Henüz yönlü ön filtreyi geçen aday yok. Eşikleri değiştirebilirsiniz.']);
}
async function checkEntry(entry,run,filters,useSpot,minPremium){
 const row=market.find(item=>item.symbol===entry.symbol);entry.data=row;
 entry.price=null;entry.oi=null;entry.premium=null;entry.positioning={};entry.positioningText="Konumlanma bekleniyor";
 const warnings=[];const shortThreshold=Math.min(100,Math.max(50,num('minShort')));
 if(!row){entry.status='Piyasa verisi alınamadı';entry.checkedAt=Date.now();return}
 const answers=await Promise.allSettled([
  fut('/fapi/v1/klines',{symbol:entry.symbol,interval:'5m',limit:40}),
  fut('/futures/data/openInterestHist',{symbol:entry.symbol,period:'5m',limit:10}),
  ...['globalLongShortAccountRatio','topLongShortAccountRatio','topLongShortPositionRatio'].map(endpoint=>fut('/futures/data/'+endpoint,{symbol:entry.symbol,period:'5m',limit:1}))
 ]);
 if(run!==watchRun)return;
 try{
  if(answers[1].status==='rejected')throw answers[1].reason;
  entry.oi=FuturesDetail.oiMetrics(answers[1].value,entry.symbol).find(item=>item.minutes===15);
 }catch(error){warnings.push('OI: '+String(error.message||error))}
 try{
  if(answers[0].status==='rejected')throw answers[0].reason;
  const bars=FuturesDetail.fiveMinuteBars(answers[0].value);
  if(!Number.isFinite(entry.reference)&&bars.length&&Date.now()-bars.at(-1).end<=300000)entry.reference=bars.at(-1).low;
  // Compare price/volume at the OI sample boundary, not at a later candle close.
  if(entry.oi?.change!=null)entry.price=FuturesDetail.windowMetrics(answers[0].value,entry.oi.end).find(item=>item.minutes===15);
 }catch(error){warnings.push('5m: '+String(error.message||error))}
 const groupKeys=['general','topAccounts','topPositions'],groupNames=['Genel hesap','Büyük hesap','Büyük pozisyon'];
 const groupErrors=[];
 for(let i=0;i<3;i++){
  try{if(answers[i+2].status==='rejected')throw answers[i+2].reason;entry.positioning[groupKeys[i]]=FuturesOpportunity.positioning(answers[i+2].value,entry.symbol)}
  catch(error){groupErrors.push(groupNames[i]+': '+String(error.message||error))}
 }
 entry.positioningText=FuturesOpportunity.positioningSummary(entry.positioning,shortThreshold);
 for(const key of groupKeys)if(entry.positioning[key])entry.positioningText+=' · '+groupNames[groupKeys.indexOf(key)]+' '+utc(entry.positioning[key].time);
 if(groupErrors.length)entry.positioningText+=' · '+groupErrors.join(' · ');
 entry.status=FuturesOpportunity.assess(row,filters,entry.price,entry.oi,entry.reference);
 if(useSpot){
  try{
   const symbol=FuturesOpportunity.spotSymbol(spotInfo,row.baseAsset);
   if(!symbol)throw Error('Doğrulanmış birebir spot karşılığı yok');
   const started=Date.now();
   const [spot,future]=await Promise.all([api('https://api.binance.com','/api/v3/ticker/bookTicker',{symbol}),fut('/fapi/v1/ticker/bookTicker',{symbol:entry.symbol})]);
   if(Date.now()-started>10000)throw Error('Fiyat istekleri gecikti');
   entry.premium=FuturesOpportunity.premium(spot,future);
   if(entry.premium<minPremium)entry.status='Spot primi eşiğin altında · '+entry.status;
  }catch(error){warnings.push('Spot doğrulanamadı: '+String(error.message||error))}
 }
 if(warnings.length)entry.status+=' · '+warnings.join(' · ');
 if(Number.isFinite(entry.reference))entry.status+=' · İlk 5m dip: '+fmt(entry.reference,8);
 entry.checkedAt=Date.now();
}
async function updateWatch(){
 if(watchBusy)return;watchBusy=true;const run=++watchRun;
 const filters=watchFilters(),useSpot=$('useSpot').checked,minPremium=num('minPremium');
 $('watch-refresh').disabled=true;$('watch-status').textContent='Adaylar kontrol ediliyor...';
 try{
  if(useSpot&&!spotInfo){try{spotInfo=await api('https://api.binance.com','/api/v3/exchangeInfo')}catch{spotInfo=null}}
  if(run!==watchRun)return;
  const fresh=Date.now()-marketLoadedAt<=180000;
  if(fresh)for(const row of market){
   if(watchEntries.size>=5)break;
   if(!watchEntries.has(row.symbol)&&FuturesOpportunity.qualifies(row,filters))watchEntries.set(row.symbol,{symbol:row.symbol,firstSeen:Date.now(),firstPrice:row.price,firstFunding:row.funding,reference:null});
  }
  // Two workers bound request concurrency; slots remain until the user clears the list.
  const queue=[...watchEntries.values()];
  async function worker(){while(queue.length&&run===watchRun){const entry=queue.shift();await checkEntry(entry,run,filters,useSpot,minPremium);if(run===watchRun)renderWatch()}}
  await Promise.all([worker(),worker()]);
  if(run===watchRun){renderWatch();$('watch-status').textContent=`${watchEntries.size}/5 izlenen · Son kontrol: ${utc(Date.now())} · ${useSpot?'Spot kontrolü açık':'Spot kontrolü kapalı'}`}
 }finally{watchBusy=false;$('watch-refresh').disabled=false;if(watchResetPending){watchResetPending=false;updateWatch()}}
}
$('watch-refresh').onclick=()=>scan();
$('watch-clear').onclick=()=>{watchRun++;watchEntries.clear();renderWatch();if(watchBusy)watchResetPending=true;else updateWatch()};
$('watch-results').onclick=event=>{const row=event.target.closest('tr[data-symbol]');if(row&&market.some(item=>item.symbol===row.dataset.symbol)){$('symbol').value=row.dataset.symbol;load()}};
for(const id of ['minVolume','minChange','minFunding','scanMode','minShort','useSpot','minPremium'])$(id).addEventListener('change',()=>{if(watchBusy){watchRun++;watchResetPending=true}else updateWatch()});
function syncMode(){ $('minFunding').disabled=$('scanMode').value==='momentum'; }
$('scanMode').addEventListener('change',syncMode);syncMode();
setInterval(renderWatch,15000);
