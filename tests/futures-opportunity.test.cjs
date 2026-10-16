const {test}=require('node:test');const assert=require('node:assert/strict');
const {qualifies,assess,spotSymbol,premium}=require('../futures/opportunity.js');
const now=1700000000000,filters={volume:30,change:20,funding:0.1};
const row={valid:true,price:100,change:78,volume:37000000,funding:-0.47,tickTime:now,markTime:now};
test('directional filter requires rising price and negative funding, plus fresh data',()=>{
 assert.equal(qualifies(row,filters,now),true);
 for(const extra of [{change:-78},{funding:0.47},{funding:-0.05},{volume:1},{tickTime:now-180001},{markTime:now+10001},{valid:false}])assert.equal(qualifies({...row,...extra},filters,now),false);
 assert.equal(qualifies({...row,change:0,funding:0},{volume:0,change:0,funding:0},now),false);
});
test('assessment allows rising and falling OI and identifies weakening or lost reference',()=>{
 const metrics={priceChange:1,volumeChange:20};
 assert.match(assess(row,filters,metrics,{change:1},90,now),/OI artıyor/);
 assert.match(assess(row,filters,metrics,{change:-1},90,now),/OI azalıyor/);
 assert.match(assess(row,filters,{...metrics,volumeChange:-1},{change:1},90,now),/Zayıflama/);
 assert.match(assess(row,filters,metrics,{change:1},101,now),/referansı kaybedildi/);
 assert.match(assess({...row,funding:0.1},filters,metrics,{change:1},90,now),/koşulları bozuldu/);
 assert.match(assess(row,filters,null,{change:1},90,now),/bekleniyor/);
});
test('spot mapping only accepts exact base asset, never guesses contract multipliers',()=>{
 const info={symbols:[{symbol:'PEPEUSDT',baseAsset:'PEPE',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}]};
 assert.equal(spotSymbol(info,'PEPE'),'PEPEUSDT');assert.equal(spotSymbol(info,'1000PEPE'),null);assert.equal(spotSymbol(null,'PEPE'),null);
});
test('spot premium uses comparable positive bid ask midpoints',()=>{
 const value=premium({bidPrice:'0.3498',askPrice:'0.3500'},{bidPrice:'0.3457',askPrice:'0.3459'});
 assert.ok(Math.abs(value-((0.3499/0.3458-1)*100))<1e-10);
 assert.throws(()=>premium({bidPrice:'0',askPrice:'1'},{bidPrice:'2',askPrice:'3'}),/Geçersiz/);
 assert.throws(()=>premium({bidPrice:'2',askPrice:'1'},{bidPrice:'2',askPrice:'3'}),/Geçersiz/);
});
test('momentum mode includes positive funding examples while negative mode remains selective',()=>{
 const positive={...row,funding:0.02879};
 assert.equal(qualifies(positive,{...filters,mode:'momentum'},now),true);
 assert.equal(qualifies(positive,{...filters,mode:'negative'},now),false);
 assert.equal(qualifies({...positive,change:-78},{...filters,mode:'momentum'},now),false);
 assert.equal(qualifies({...positive,volume:475760000},{...filters,volume:600,mode:'momentum'},now),false);
});
test('positioning parses each population independently and rejects missing or stale samples',()=>{
 const {positioning,positioningSummary}=require('../futures/opportunity.js');
 const sample={symbol:'SOLUSDT',longAccount:'0.3',shortAccount:'0.7',longShortRatio:'0.4286',timestamp:now};
 const general=positioning([sample],'SOLUSDT',now);
 const topPositions=positioning([{...sample,longAccount:'0.6',shortAccount:'0.4',longShortRatio:'1.5'}],'SOLUSDT',now);
 assert.equal(general.short,70);assert.equal(topPositions.short,40);
 assert.equal(positioningSummary({general,topPositions},60),'Genel hesaplar short ağırlıklı');
 assert.equal(positioningSummary({},60),'Konumlanma bilinmiyor');
 for(const extra of [{symbol:'BTCUSDT'},{timestamp:now-600001},{shortAccount:null},{shortAccount:'0.9'},{longShortRatio:''}])assert.throws(()=>positioning([{...sample,...extra}],'SOLUSDT',now),/geçersiz/);
 assert.throws(()=>positioning([],'SOLUSDT',now),/yok/);
});
