const {test}=require('node:test'),assert=require('node:assert/strict');
const {calculate,divergences,analyze}=require('../futures/rsi.js');
const boundary=1700000100000,step=300000;
const bars=closes=>closes.map((close,i)=>({time:boundary+i*step,end:boundary+(i+1)*step-1,open:close,high:close+1,low:close-1,close}));
test('Wilder RSI matches published reference values and needs period + 1 closes',()=>{
 const closes=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21];
 const values=calculate(bars(closes));assert.ok(values.slice(0,14).every(x=>x===null));
 assert.ok(Math.abs(values[14]-70.464135)<0.00001);assert.ok(Math.abs(values[15]-66.249619)<0.00001);
 assert.deepEqual(calculate(bars(closes.slice(0,14))),Array(14).fill(null));
});
test('rising, falling and flat series remain finite and bounded',()=>{
 assert.equal(calculate(bars(Array.from({length:20},(_,i)=>100+i))).at(-1),100);
 assert.equal(calculate(bars(Array.from({length:20},(_,i)=>100-i))).at(-1),0);
 assert.equal(calculate(bars(Array(20).fill(100))).at(-1),50);
});
test('5m analysis distinguishes exit above 30 from a bounce still below 30',()=>{
 const down=Array.from({length:17},(_,i)=>100-i);
 const bounce=bars([...down,85]);let result=analyze(bounce,bounce.at(-1).end+1);
 assert.match(result.status,/30 altında yükseliyor/);
 const exit=bars([...down,95]);result=analyze(exit,exit.at(-1).end+1);assert.match(result.status,/30 üzerine çıktı/);
 assert.equal(analyze(exit,exit.at(-1).end+step+1).rsi,undefined);
 const gap=bars(down);gap[5].time++;assert.throws(()=>analyze(gap),/ardışık/);
});
function divergenceFixture(bear=false){
 const series=bars(Array(12).fill(100));const values=Array(12).fill(50);
 if(!bear){series[3].low=90;series[8].low=88;values[3]=20;values[8]=30}
 else{series[3].high=110;series[8].high=112;values[3]=80;values[8]=70}
 return {series,values};
}
test('regular bullish and bearish divergence uses confirmed price pivots and their RSI values',()=>{
 for(const bear of [false,true]){const {series,values}=divergenceFixture(bear);const events=divergences(series,values);
 assert.equal(events.length,1);assert.equal(events[0].type,bear?'bearish':'bullish');assert.equal(events[0].confirmed,10);assert.equal(events[0].invalidated,false);
 // The second pivot is unknown until two right-side candles have closed.
 assert.equal(divergences(series.slice(0,10),values.slice(0,10)).length,0);
 assert.equal(divergences(series.slice(0,11),values.slice(0,11)).length,1);
 }
});
test('same-direction RSI, uninitialized RSI and broken reference do not masquerade as fresh divergence',()=>{
 const {series,values}=divergenceFixture();values[8]=10;assert.equal(divergences(series,values).length,0);
 values[8]=null;assert.equal(divergences(series,values).length,0);
 values[8]=30;series[11].low=87;assert.equal(divergences(series,values)[0].invalidated,true);
});
test('RSI dip recovery can be confirmed above 30 too, but requires right-side confirmation and current rise',()=>{
 const {turn}=require('../futures/rsi.js');
 assert.deepEqual(turn([50,45,40,44,47]),{pivot:2,confirmed:4,value:40});
 assert.equal(turn([50,45,40,44]),null);
 assert.equal(turn([50,45,40,44,47,46]),null);
 assert.equal(turn([50,45,40,44,47,39,41]),null);
 assert.equal(turn([null,null,40,44,47]),null);
});
