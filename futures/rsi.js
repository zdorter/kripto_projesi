(function(root){
 'use strict';
 function calculate(bars,period=14,step=null){
  if(!Number.isInteger(period)||period<2)throw Error('RSI periyodu geçersiz');
  if(bars.some((b,i)=>!Number.isFinite(b.close)||b.close<=0||!Number.isFinite(b.time)||(i&&(b.time<=bars[i-1].time||(step&&b.time-bars[i-1].time!==step)))))throw Error('RSI için ardışık ve geçerli mumlar gerekli');
  const values=bars.map(()=>null);if(bars.length<=period)return values;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=bars[i].close-bars[i-1].close;gain+=Math.max(d,0);loss+=Math.max(-d,0)}
  gain/=period;loss/=period;
  const value=()=>gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
  values[period]=value();
  for(let i=period+1;i<bars.length;i++){const d=bars[i].close-bars[i-1].close;gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;values[i]=value()}
  return values;
 }
 function divergences(bars,values,width=2){
  const events=[];
  for(const type of ['bullish','bearish']){
   const field=type==='bullish'?'low':'high',pivots=[];
   for(let i=width;i<bars.length-width;i++){
    if(!Number.isFinite(values[i]))continue;
    const price=bars[i][field];
    const valid=Array.from({length:width},(_,n)=>n+1).every(n=>type==='bullish'?price<bars[i-n][field]&&price<bars[i+n][field]:price>bars[i-n][field]&&price>bars[i+n][field]);
    if(!valid)continue;
    const previous=pivots.at(-1);pivots.push(i);
    if(previous===undefined||i-previous<3||i-previous>60)continue;
    const diverges=type==='bullish'?price<bars[previous].low&&values[i]>values[previous]:price>bars[previous].high&&values[i]<values[previous];
    if(!diverges)continue;
    const confirmed=i+width;
    const invalidated=bars.slice(confirmed+1).some(b=>type==='bullish'?b.low<price:b.high>price);
    events.push({type,first:previous,second:i,confirmed,invalidated});
   }
  }
  return events.sort((a,b)=>a.confirmed-b.confirmed);
 }
 function turn(values){
  const last=values.length-1;
  if(!Number.isFinite(values[last])||!Number.isFinite(values[last-1])||values[last]<=values[last-1])return null;
  for(let i=last-2;i>=Math.max(2,last-8);i--){
   if(!Number.isFinite(values[i]))continue;
   if([1,2].every(n=>Number.isFinite(values[i-n])&&Number.isFinite(values[i+n])&&values[i]<values[i-n]&&values[i]<values[i+n])&&values.slice(i+1).every(v=>v>=values[i]))return {pivot:i,confirmed:i+2,value:values[i]};
  }
  return null;
 }
 function analyze(bars,now=Date.now()){
  const values=calculate(bars,14,300000),last=bars.at(-1);
  if(!last||bars.length<16)return {values,events:[],status:'RSI(14) için en az 16 kapanmış 5m mum gerekli'};
  if(now-last.end>300000)return {values,events:[],status:'5m RSI verisi eski; değerlendirme yapılmadı'};
  const rsi=values.at(-1),previous=values.at(-2);
  const status=previous<30&&rsi>=30?'RSI 30 üzerine çıktı · aşırı satımdan dönüş':rsi<30&&rsi>previous?'RSI 30 altında yükseliyor · dönüş henüz doğrulanmadı':rsi<30?'RSI aşırı satım bölgesinde':rsi>previous?'RSI yükseliyor · yeni 30 yukarı kesişimi yok':'RSI yükselmiyor';
  return {values,events:divergences(bars,values),status,rsi,previous,turn:turn(values)};
 }
 const api={calculate,divergences,analyze,turn};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FuturesRsi=api;
})(globalThis);
