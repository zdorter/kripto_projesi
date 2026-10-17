(function(root){
 'use strict';
 function fundingTrend(samples, now=Date.now()){
  const points=samples.filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&p.time<=now).sort((a,b)=>a.time-b.time);
  const last=points.at(-1),first=last&&points.filter(p=>p.time<=last.time-900000&&p.time>=last.time-1020000).at(-1);
  if(!last||now-last.time>180000||!first)return {change:null,reason:'15 dk funding gözlemi bekleniyor'};
  const period=points.filter(p=>p.time>=first.time);
  if(period.some((p,i)=>i&&p.time-period[i-1].time>180000))return {change:null,reason:'Funding gözlemlerinde boşluk var'};
  return {change:last.value-first.value,start:first.time,end:last.time,negative:last.value<0};
 }
 function shortTrend(rows,symbol,parse,now=Date.now()){
  const last=parse(rows,symbol,now),first=rows.find(p=>Number(p.timestamp)===last.time-900000);
  if(!first)return {...last,change:null};
  const previous=parse([first],symbol,Number(first.timestamp));
  return {...last,change:last.short-previous.short,start:previous.time};
 }
 function pullback(bars,now=Date.now()){
  const recent=bars.slice(-20),last=recent.at(-1);
  if(recent.length<8||!last||now-last.end>300000||recent.some((p,i)=>i&&p.time-recent[i-1].time!==300000))return {state:'Veri bekleniyor',reason:'Güncel, ardışık 5m mumları gerekli'};
  const lows=[];
  for(let i=1;i<recent.length-1;i++)if(recent[i].low<recent[i-1].low&&recent[i].low<recent[i+1].low)lows.push(i);
  for(let n=lows.length-1;n>0;n--){
   const b=lows[n],a=lows[n-1];
   if(b-a<2||recent[b].low<=recent[a].low)continue;
   const before=recent.slice(0,a);if(!before.length)continue;
   const peak=Math.max(...before.map(p=>p.high)),dip=recent[a].low;
   if((peak-dip)/peak<0.003)continue;
   const trigger=Math.max(...recent.slice(a+1,b).map(p=>p.high));
   if(!Number.isFinite(trigger)||trigger>=peak)continue;
   const result={dip,higherLow:recent[b].low,trigger,time:last.end};
   if(recent.slice(b+1).some(p=>p.low<=dip))return {...result,state:'Geçersiz',reason:'Geri çekilme dibi kaybedildi'};
   const closes=recent.slice(b+1);
   if(closes.slice(0,-1).some(p=>p.close>trigger))return {...result,state:'Eski kırılım',reason:'Kırılım önceki mumda oluştu; yeni yapı bekleniyor'};
   if(last.close>trigger)return {...result,state:'Dönüş tetiklendi',reason:'Daha yüksek dip sonrası 5m kapanışı ara tepeyi aştı'};
   return {...result,state:'Kırılım bekleniyor',reason:'Daha yüksek dip var; ara tepe üzerinde kapanış bekleniyor'};
  }
  return {state:'Yapı bekleniyor',reason:'Geri çekilme ve doğrulanmış daha yüksek dip henüz yok'};
 }
 function evaluate(row,filters,oi,short,funding,structure,shortThreshold,qualifies,now=Date.now()){
  if(!row||!qualifies(row,{...filters,mode:'momentum'},now))return 'Ortam uygun değil · yükseliş/hacim koşulu yok';
  if(!Number.isFinite(row.gainRank))return 'Bekleniyor · yükseliş sırası bilinmiyor';
  if(row.gainRank>(filters.maxRank||20))return 'Ortam uygun değil · yükseliş sırası dışında';
  if(!oi||oi.change==null||!short||short.change==null||funding.change==null)return 'Bekleniyor · OI/short/funding geçmişi eksik';
  if(short.time!==oi.end)return 'Bekleniyor · OI ve short örnek zamanları eşleşmiyor';
  if(!(oi.change>0&&funding.negative&&funding.change<0&&short.short>50&&short.short>=shortThreshold&&short.change>0))return 'Ortam koşulları tamamlanmadı';
  return structure.state==='Dönüş tetiklendi'?'Long inceleme adayı · 5m dönüş tetiklendi':'Ortam uygun · '+structure.state;
 }
 const api={fundingTrend,shortTrend,pullback,evaluate};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FuturesScalp=api;
})(globalThis);
