const {test}=require('node:test'),assert=require('node:assert/strict');
const {fundingTrend,shortTrend,pullback,evaluate}=require('../futures/scalp-setup.js');
const {positioning,qualifies}=require('../futures/opportunity.js');
const step=300000,now=1700000100000;
function bars(){const raw=[[100,104,99,103],[103,110,102,109],[109,109.5,104,105],[105,106,100,101],[104,106,103,105],[103,104,102,103],[104,105,103,104],[105,108,104,107]];return raw.map(([open,high,low,close],i)=>({open,high,low,close,time:now-(8-i)*step,end:now-(7-i)*step-1,volume:100}))}
test('higher low and new close above intervening peak trigger; mere bounce does not',()=>{
 const result=pullback(bars(),now);assert.equal(result.state,'Dönüş tetiklendi');assert.equal(result.dip,100);assert.equal(result.trigger,106);
 const waiting=bars();waiting.at(-1).close=105;assert.equal(pullback(waiting,now).state,'Kırılım bekleniyor');
 const lost=bars();lost.at(-1).low=99;assert.equal(pullback(lost,now).state,'Geçersiz');
 const old=bars();old[6].close=107;old[6].high=108;assert.equal(pullback(old,now).state,'Eski kırılım');
});
test('missing, stale and discontinuous candles cannot trigger',()=>{
 assert.equal(pullback([],now).state,'Veri bekleniyor');
 assert.equal(pullback(bars(),now+step+1).state,'Veri bekleniyor');
 const gap=bars();gap[4].time-=1;assert.equal(pullback(gap,now).state,'Veri bekleniyor');
 const flat=bars().map(p=>({...p,low:100,high:101,open:100,close:100.5}));assert.equal(pullback(flat,now).state,'Yapı bekleniyor');
});
test('funding needs 15 minutes of uninterrupted observation and preserves signed changes',()=>{
 const samples=Array.from({length:16},(_,i)=>({time:now-(15-i)*60000,value:-0.1-i*0.01}));
 const result=fundingTrend(samples,now);assert.ok(Math.abs(result.change+0.15)<1e-10);assert.equal(result.negative,true);
 assert.equal(fundingTrend(samples.slice(1),now).change,null);
 assert.equal(fundingTrend(samples.filter((_,i)=>i<3||i>8),now).change,null);
 assert.equal(fundingTrend(samples,now+180001).change,null);
});
test('short share trend compares exact 15m general-account samples',()=>{
 const sample=(time,short)=>({symbol:'SOLUSDT',timestamp:time,shortAccount:String(short),longAccount:String(1-short),longShortRatio:String((1-short)/short)});
 const result=shortTrend([sample(now-900000,0.6),sample(now,0.7)],'SOLUSDT',positioning,now);
 assert.ok(Math.abs(result.change-10)<1e-10);assert.equal(result.start,now-900000);
 assert.equal(shortTrend([sample(now,0.7)],'SOLUSDT',positioning,now).change,null);
});
test('setup requires every environment condition, aligned samples and fresh breakout',()=>{
 const row={valid:true,change:40,volume:50000000,funding:-0.2,tickTime:now,markTime:now,gainRank:3};
 const filters={volume:30,change:20,funding:0.1,maxRank:20};
 const run=(oi={change:1,end:now},short={change:2,short:65,time:now},funding={change:-0.1,negative:true},structure={state:'Dönüş tetiklendi'},market=row)=>evaluate(market,filters,oi,short,funding,structure,60,qualifies,now);
 assert.match(run(),/Long inceleme adayı/);
 assert.match(run(undefined,undefined,{change:null}),/geçmişi eksik/);
 assert.match(run(undefined,{change:2,short:65,time:now-step}),/eşleşmiyor/);
 assert.match(run({change:-1,end:now}),/tamamlanmadı/);
 assert.match(run(undefined,undefined,{change:0.1,negative:true}),/tamamlanmadı/);
 assert.match(run(undefined,{change:-1,short:65,time:now}),/tamamlanmadı/);
 assert.match(run(undefined,undefined,undefined,{state:'Eski kırılım'}),/Eski kırılım/);
 assert.match(run(undefined,undefined,undefined,undefined,{...row,gainRank:21}),/sırası dışında/);
});
