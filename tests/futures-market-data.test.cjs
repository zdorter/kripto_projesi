const {test}=require('node:test');
const assert=require('node:assert/strict');
const {marketRows,matches}=require('../futures/market-data.js');
const now=1700000000000;
const info={symbols:[
  {symbol:'SOLUSDT',baseAsset:'SOL',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT'},
  {symbol:'BTCUSDT',baseAsset:'BTC',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT'},
  {symbol:'OLDUSDT',status:'SETTLING',contractType:'PERPETUAL',quoteAsset:'USDT'},
  {symbol:'DELIVERY',status:'TRADING',contractType:'CURRENT_QUARTER',quoteAsset:'USDT'},
  {symbol:'BTCUSDC',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDC'}]};
const ticker=(symbol,extra={})=>({symbol,lastPrice:'100',priceChangePercent:'25',quoteVolume:'40000000',closeTime:now,...extra});
const premium=(symbol,extra={})=>({symbol,lastFundingRate:'-0.0047',time:now,...extra});
test('selects trading USDT perpetuals, joins by symbol and converts funding to percent',()=>{
 const rows=marketRows(info,[ticker('BTCUSDT'),ticker('SOLUSDT',{quoteVolume:'50000000'})],[premium('SOLUSDT'),premium('BTCUSDT')],now);
 assert.deepEqual(rows.map(r=>r.symbol),['SOLUSDT','BTCUSDT']);
 assert.ok(Math.abs(rows[0].funding + 0.47) < 1e-10);assert.equal(rows[0].valid,true);
 assert.equal(matches(rows[0],{volume:30,change:20,funding:0.1}),true);
 assert.equal(matches(rows[0],{volume:60,change:20,funding:0.1}),false);
});
test('missing funding is retained as unavailable and never passes even zero thresholds',()=>{
 const row=marketRows(info,[ticker('SOLUSDT')],[],now)[0];
 assert.equal(row.valid,false);assert.equal(matches(row,{volume:0,change:0,funding:0}),false);
});
test('stale or future timestamps cannot produce candidates',()=>{
 for(const time of [now-180001,now+10001]){
 const row=marketRows(info,[ticker('SOLUSDT')],[premium('SOLUSDT',{time})],now)[0];
 assert.equal(row.valid,false);assert.equal(matches(row,{volume:0,change:0,funding:0}),false);
 }
});
test('empty and invalid numeric values cannot masquerade as real zero values',()=>{
 for(const lastFundingRate of ['',null,'bad']){
 const row=marketRows(info,[ticker('SOLUSDT')],[premium('SOLUSDT',{lastFundingRate})],now)[0];assert.equal(row.valid,false);
 }
});
test('unexpected API payload fails explicitly',()=>{
 assert.throws(()=>marketRows(info,{code:-1003},[],now),/yanıtı/);
});
