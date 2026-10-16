const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fiveMinuteBars,windowMetrics,oiMetrics}=require('../futures/detail-data.js');
const step=300000, boundary=1700000100000, now=boundary+10000;
const candles=()=>Array.from({length:13},(_,i)=>{
 const time=boundary-(12-i)*step;
 return [time,'100','120','90','110','1',time+step-1,i<6?'100':'200'];
});
const history=()=>Array.from({length:7},(_,i)=>({symbol:'SOLUSDT',timestamp:boundary-(6-i)*step,sumOpenInterest:String(100+i*10)}));
test('closed 5m windows exclude the live candle and compare equal-length quote volumes',()=>{
 const bars=candles();bars.at(-1)[4]='999';
 assert.equal(fiveMinuteBars(bars,now).length,12);
 const metrics=windowMetrics(bars,now);
 assert.deepEqual(metrics.map(x=>x.quoteVolume),[200,600,1200]);
 assert.ok(metrics.every(x=>Math.abs(x.priceChange-10)<1e-10));
 assert.deepEqual(metrics.map(x=>x.volumeChange),[0,0,100]);
 assert.equal(metrics[2].start,boundary-6*step);assert.equal(metrics[2].end,boundary-1);
});
test('insufficient candles and gaps never fabricate period metrics',()=>{
 const bars=candles().slice(-3);const metrics=windowMetrics(bars,now);
 assert.equal(metrics[0].quoteVolume,200);assert.equal(metrics[1].priceChange,null);
 const gap=candles();gap.splice(10,1);const incomplete=windowMetrics(gap,now);
 assert.equal(incomplete[1].quoteVolume,null);assert.equal(incomplete[0].volumeChange,null);
});
test('stale candles, zero volume baseline and invalid OHLC values are distinguished',()=>{
 assert.equal(windowMetrics(candles().slice(0,-1),now+step)[0].priceChange,null);
 const zero=candles();zero[10][7]='0';assert.equal(windowMetrics(zero,now)[0].volumeChange,null);
 const invalid=candles();invalid[0][1]=null;assert.throws(()=>windowMetrics(invalid,now),/geçersiz/);
 const duplicate=candles();duplicate.push(duplicate[0]);assert.throws(()=>windowMetrics(duplicate,now),/geçersiz/);
});
test('OI compares exact 5, 15 and 30 minute sample timestamps',()=>{
 const rows=oiMetrics(history(),'SOLUSDT',now);
 for(const [i,baseline] of [150,130,100].entries())assert.ok(Math.abs(rows[i].change-(160/baseline-1)*100)<1e-10);
 assert.equal(rows[2].start,boundary-6*step);assert.equal(rows[2].end,boundary);
});
test('OI missing comparison, zero baseline and stale history remain unavailable',()=>{
 const missing=history().filter((_,i)=>i!==5);assert.equal(oiMetrics(missing,'SOLUSDT',now)[0].change,null);
 const zero=history();zero[5].sumOpenInterest='0';assert.equal(oiMetrics(zero,'SOLUSDT',now)[0].change,null);
 assert.ok(oiMetrics(history(),'SOLUSDT',now+3*step).every(x=>x.change===null));
 assert.ok(oiMetrics([],'SOLUSDT',now).every(x=>x.change===null));
});
test('OI mismatched symbol, duplicate, future timestamp and malformed payload fail explicitly',()=>{
 assert.throws(()=>oiMetrics(history(),'BTCUSDT',now),/uyumsuzluğu/);
 const duplicate=history();duplicate.push(duplicate[0]);assert.throws(()=>oiMetrics(duplicate,'SOLUSDT',now),/uyumsuzluğu/);
 assert.throws(()=>oiMetrics(history(),'SOLUSDT',boundary-1),/uyumsuzluğu/);
 assert.throws(()=>oiMetrics({code:-1},'SOLUSDT',now),/geçersiz/);
});
