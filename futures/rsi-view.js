'use strict';
let rsiChart=null,rsiSyncCleanup=[];
function destroyRsiChart(){for(const cleanup of rsiSyncCleanup)cleanup();rsiSyncCleanup=[];if(rsiChart){rsiChart.remove();rsiChart=null}}
function renderRsiChart(bars,options,candle){
 destroyRsiChart();
 const source=bars.map(b=>({...b,time:b.time*1000}));
 const step={'5m':300000,'15m':900000,'1h':3600000,'4h':14400000}[state.tf];
 const values=FuturesRsi.calculate(source,14,step);
 const events=FuturesRsi.divergences(source,values).slice(-3);
 $('rsi-label').textContent='RSI(14) · '+state.tf+' · Kapanmış mumlar';
 rsiChart=LightweightCharts.createChart($('rsi-chart'),{...options,rightPriceScale:{minimumWidth:80,scaleMargins:{top:0.08,bottom:0.08}}});
 const line=rsiChart.addLineSeries({color:'#c4a5ff',lineWidth:2,priceFormat:{type:'price',precision:2,minMove:0.01},autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})});
 line.setData(bars.map((bar,i)=>values[i]==null?{time:bar.time}:{time:bar.time,value:values[i]}));
 for(const price of [30,50,70])line.createPriceLine({price,color:price===50?'#475569':'#b78a41',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:String(price)});
 const markers=[];
 for(const event of events){const bullish=event.type==='bullish',color=event.invalidated?'#94a3b8':bullish?'#34d399':'#fb7185';
  for(const index of [event.first,event.second])markers.push({time:bars[index].time,position:bullish?'belowBar':'aboveBar',shape:bullish?'arrowUp':'arrowDown',color,text:(bullish?'Bull':'Bear')+(event.invalidated?' · eski':'')});
  const segment=rsiChart.addLineSeries({color,lineWidth:2,priceLineVisible:false,lastValueVisible:false});
  segment.setData([event.first,event.second].map(i=>({time:bars[i].time,value:values[i]})));
 }
 const sorted=markers.sort((a,b)=>a.time-b.time);line.setMarkers(sorted);candle.setMarkers(sorted);
 const charts=[state.chart,state.volChart,rsiChart];let syncing=false;
 for(const chart of charts){const handler=range=>{if(!range||syncing)return;syncing=true;try{for(const other of charts)if(other!==chart)other.timeScale().setVisibleLogicalRange(range)}finally{syncing=false}};chart.timeScale().subscribeVisibleLogicalRangeChange(handler);rsiSyncCleanup.push(()=>chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler))}
 rsiChart.timeScale().fitContent();
}
function renderFiveMinuteRsi(rows,symbol){
 try{
  const bars=FuturesDetail.fiveMinuteBars(rows),result=FuturesRsi.analyze(bars);
  $('rsi-5m-status').textContent=symbol+' · 5m · '+(result.rsi==null?'':('RSI '+fmt(result.rsi,2)+' · '))+result.status+(result.turn?' · Doğrulanmış RSI dibinden yükseliyor: '+fmt(result.turn.value,2)+' ('+turkeyTime(bars[result.turn.pivot].time)+')':'');
  if(result.rsi==null){$('rsi-divergence').textContent='Uyumsuzluk değerlendirilemedi';return}
  const event=result.events.at(-1);
  if(!event){$('rsi-divergence').textContent='Doğrulanmış klasik RSI uyumsuzluğu yok / yeterli pivot yok';return}
  const bullish=event.type==='bullish';
  $('rsi-divergence').textContent=(bullish?'Pozitif uyumsuzluk: fiyat daha düşük dip, RSI daha yüksek dip. ':'Negatif uyumsuzluk: fiyat daha yüksek tepe, RSI daha düşük tepe. ')+
   turkeyTime(bars[event.first].time)+' → '+turkeyTime(bars[event.second].time)+' · Doğrulama: '+turkeyTime(bars[event.confirmed].end)+
   ' · RSI '+fmt(result.values[event.first],2)+' → '+fmt(result.values[event.second],2)+(event.invalidated?' · Sonraki fiyat hareketi referansı aştı; geçmiş olay':' · Geçmiş doğrulanmış olay; tek başına giriş değildir');
 }catch(error){$('rsi-5m-status').textContent=symbol+' · 5m RSI hesaplanamadı: '+String(error.message||error);$('rsi-divergence').textContent='Uyumsuzluk değerlendirilemedi'}
}
