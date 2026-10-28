/* Regression for Léo's intermittent Home layout shift after F5.
   Real chromium, fresh temporary SQLite + browser profile, never his data. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18825,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-home-refresh-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},
  stdio:'ignore'
});
async function ready(){
  for(let attempt=0;attempt<130;attempt++){
    try{if((await fetch(base+'/api/version')).ok)return}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  throw Error('Temporary TEST server did not start');
}
(async()=>{
  let browser;
  try{
    await ready();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1920,height:950}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>homeCanvasReady&&!!document.querySelector('#homeCanvas'));
    // Track only the original visible cards, including a full-width calendar
    // at >=1800px, which previously caused a horizontal scrollbar and F5 shift.
    const inspect=()=>page.evaluate(()=>{
      const canvas=document.querySelector('#homeCanvas');
      const rect=canvas.getBoundingClientRect();
      const names=['homeBudgetWidget','homeUpcomingWidget','journalBook','openCalendarCard'];
      const cards=Object.fromEntries(names.map(name=>{
        const element=document.getElementById(name),r=element.getBoundingClientRect();
        return [name,{x:r.left,y:r.top,width:r.width,right:r.right,visible:r.width>0}];
      }));
      return {
        scrollX:window.scrollX,
        documentWidth:document.documentElement.scrollWidth,
        viewport:window.innerWidth,
        canvasWidth:rect.width,
        top:rect.top,
        cards
      };
    });
    async function assertHome(label){
      await page.waitForFunction(()=>homeCanvasReady);
      await page.waitForTimeout(120);
      const state=await inspect();
      assert.equal(state.scrollX,0,label+' retained horizontal scrolling: '+JSON.stringify(state));
      assert.ok(state.documentWidth<=state.viewport+3,
        label+' has unexpected page width: '+JSON.stringify(state));
      for(const [name,card] of Object.entries(state.cards)){
        if(!card.visible)continue;
        assert.ok(card.x>=-2,label+' clips the left edge of '+name+': '+JSON.stringify(state));
        assert.ok(card.right<=state.viewport+3,
          label+' clips the right edge of '+name+': '+JSON.stringify(state));
      }
    }
    await assertHome('Fresh load on 1920px desktop');

    // The existing layout can have perfectly valid saved x coordinates that
    // exceed a smaller viewport. Never rewrite those original preferences.
    const original={
      homeBudgetWidget:{x:1500,y:20,width:310,height:null,scale:1},
      calendar:{x:1300,y:20,width:440,height:null,scale:1},
      upcoming:{x:1350,y:240,width:365,height:null,scale:1},
      journal:{x:1100,y:345,width:680,height:null,scale:1}
    };
    await page.evaluate(values=>{
      for(const [id,geometry] of Object.entries(values))
        localStorage.setItem('atelierHomeCanvasV2_'+id,JSON.stringify(geometry));
    },original);
    await page.reload({waitUntil:'domcontentloaded'});
    await assertHome('Restored saved desktop positions');
    const exact=await page.evaluate(values=>Object.keys(values).every(id=>
      localStorage.getItem('atelierHomeCanvasV2_'+id)===JSON.stringify(values[id])),original);
    assert.ok(exact,'The original saved dimensions/positions may not be overwritten');

    // Open and close the drag-able navigation drawer before refreshing, then
    // toggle edit mode and reload while selected. Neither state may shift cards.
    await page.evaluate(()=>setSideNavCollapsed(false));
    await page.reload({waitUntil:'domcontentloaded'});
    await assertHome('F5 with navigation drawer open');
    await page.evaluate(()=>setSideNavCollapsed(true));
    await page.locator('#globalLayoutEdit').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await assertHome('F5 after entering edit mode');
    assert.ok(await page.evaluate(values=>Object.keys(values).every(id=>
      localStorage.getItem('atelierHomeCanvasV2_'+id)===JSON.stringify(values[id])),original));

    // Window resize without a reload must keep all cards in the visible area.
    for(const width of [1280,1650,1920,1100]){
      await page.setViewportSize({width,height:850});
      await page.waitForTimeout(280);
      await assertHome('Resizing to '+width);
    }
    await page.reload({waitUntil:'domcontentloaded'});
    await assertHome('Reload on narrow desktop');
    await page.setViewportSize({width:1920,height:950});
    await page.waitForTimeout(270);
    await assertHome('Return to original desktop width');
    const positions=await page.evaluate(()=>({
      calendar:document.getElementById('openCalendarCard').getBoundingClientRect().left,
      stored:JSON.parse(localStorage.getItem('atelierHomeCanvasV2_calendar')).x,
      canvasLeft:document.querySelector('#homeCanvas').getBoundingClientRect().left
    }));
    assert.ok(Math.abs(positions.calendar-(positions.stored+positions.canvasLeft))<5,
      'The original position must return on a wide enough desktop');

    if(errors.length)throw Error('Unexpected browser errors: '+errors.join(' / '));
    console.log('PASS: 1920px calendar, navigation drawer, edit mode, repeated F5, window resize and saved layout preservation');
  }finally{
    await browser?.close();
    server.kill();
    rmSync(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
