import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { resolve } from 'node:path';

let browser:Browser,server:PreviewServer,origin:string;
beforeAll(async()=> {
  server=await preview({configFile:false,root:resolve('site'),preview:{host:'127.0.0.1',port:0}});
  origin=server.resolvedUrls!.local[0]!;browser=await chromium.launch({headless:true});
});
afterAll(async()=> {await browser?.close();await new Promise<void>((done,reject)=>server?.httpServer.close(error=>error?reject(error):done()));});
async function withPage(width:number,javaScriptEnabled:boolean,run:(page:Page,errors:string[])=>Promise<void>,reducedMotion:'reduce'|'no-preference'='reduce') {
  const context=await browser.newContext({viewport:{width,height:900},javaScriptEnabled,reducedMotion}),errors:string[]=[];
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await context.route('**/*',route=> {
    if(new URL(route.request().url()).origin!==new URL(origin).origin) {errors.push(`External request: ${route.request().url()}`);return route.abort();}
    return route.continue();
  });
  try {await run(await context.newPage(),errors);} finally {await context.close();}
}
async function expectFocusedHomepage(page:Page) {
  for(const id of ['modes','inspector','workflows','privacy']) {expect(await page.locator(`#${id}`).count()).toBe(0);expect(await page.locator(`a[href="#${id}"]`).count()).toBe(0);}
  expect(await page.locator('.faq-item').count()).toBe(5);
  expect(await page.getByRole('navigation',{name:'Footer navigation'}).getByRole('link',{name:'Limits',exact:true}).getAttribute('href')).toBe('./docs.html#limits');
}
async function expectForkStop(page:Page) {
  const end=await page.locator('[data-fork-trace="with"]').evaluate(element=> {
    const path=element as SVGPathElement,point=path.getPointAtLength(path.getTotalLength());
    return {x:point.x,y:point.y};
  });
  expect(end).toEqual({x:750,y:186});
  expect(await page.locator('[data-fork-stop]').getAttribute('visibility')).toBe('visible');
}
for(const width of [320,390,640,900,1280]) test(`static React pages work without JavaScript at ${width}px`,async()=> {
  await withPage(width,false,async(page,errors)=> {
    await page.goto(origin);
    expect(await page.getByRole('heading',{name:'Some actions never land.'}).isVisible()).toBe(true);
    expect(await page.getByRole('button',{name:'Try pressing delete'}).count()).toBe(0);
    expect(await page.locator('.hero-feedback, .hero-limit, .alpha-note, [data-motion-control], [data-hero-status]').count()).toBe(0);
    expect(await page.locator('.fork-control').count()).toBe(0);await expectFocusedHomepage(page);
    expect(await page.locator('#how-it-works figure').count()).toBe(1);
    expect(await page.locator('.fork-rule').textContent()).toBe('Never delete production data.');
    expect(await page.locator('.fork-source > span').first().textContent()).toBe('Fictional Pi call · write');
    expect(await page.locator('.fork-preview').textContent()).toBe('write({ content: "[]" })');
    expect(await page.locator('.fork-verdict').textContent()).toBe('Would block');
    expect(await page.locator('.fork-data-without').textContent()).toBe('[]');
    expect(await page.locator('.fork-data-with').textContent()).toBe('[\n  { "id": "example" }\n]');
    expect(await page.locator('#how-it-works').innerText()).not.toContain('fictional data');
    await expectForkStop(page);
    expect(await page.locator('#how-it-works figcaption, #how-it-works details, .policy-transport, .policy-file, .policy-rig').count()).toBe(0);
    expect(await page.getByText('You write the rules. TENET checks eligible Pi tool calls against them.',{exact:true}).isVisible()).toBe(true);
    expect(await page.getByText('Try pressing Delete',{exact:true}).isVisible()).toBe(false);
    await page.locator('.faq-item summary').filter({hasText:'Does evidence stay on my machine?'}).click();
    expect(await page.getByText(/Real assessments send policy, paths, tool evidence/).isVisible()).toBe(true);expect(await page.getByText(/Local recording is on by default/).isVisible()).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('link',{name:'Read the setup guide'}).click();expect(await page.getByRole('heading',{name:'Use TENET in Pi.'}).isVisible()).toBe(true);
    expect(await page.locator('.language-sh').textContent()).toContain('\ncd /absolute/path/to/project\n');
    await page.getByRole('link',{name:'Back to TENET'}).click();expect(await page.locator('#headline').isVisible()).toBe(true);expect(errors).toEqual([]);
  });
});
for(const width of [1280,390]) test(`hydrated pages preserve layout, keyboard feedback and navigation at ${width}px`,async()=> {
  await withPage(width,true,async(page,errors)=> {
    let hydrate!:()=>void;const hydration=new Promise<void>(resolve=>{hydrate=resolve;});
    await page.route('**/*.js',async route=>{await hydration;await route.continue();});await page.goto(origin,{waitUntil:'commit'});
    await page.getByRole('heading',{name:'Some actions never land.'}).waitFor();
    await expect.poll(()=>page.locator('.keypress-art').evaluate(e=>getComputedStyle(e).height)).toBe(width===1280?'260px':'230px');
    await page.evaluate(()=>document.fonts.ready);const hint=page.getByText('Try pressing Delete',{exact:true});expect(await hint.isVisible()).toBe(false);
    expect(await page.getByRole('button',{name:'Try pressing delete'}).count()).toBe(0);
    const staticCaption=(await page.locator('#example-rule').boundingBox())!,docs=page.getByRole('link',{name:'Read the setup guide'}),staticArt=(await page.locator('.keypress-art').boundingBox())!;
    const staticGap=staticCaption.y-staticArt.y-staticArt.height;hydrate();
    const key=page.getByRole('button',{name:'Try pressing delete'});await key.waitFor();expect(await hint.isVisible()).toBe(true);
    expect(await page.getByText('You write the rules. TENET checks eligible Pi tool calls against them.',{exact:true}).isVisible()).toBe(true);
    const lead=(await page.locator('.hero-lead').boundingBox())!;expect(lead.y+lead.height).toBeLessThan((await docs.boundingBox())!.y);
    expect((await page.locator('#example-rule').boundingBox())!.y).toBeCloseTo(staticCaption.y,1);
    await key.focus();await page.keyboard.press('Enter');await expect.poll(()=>page.locator('[data-press-announcement]').textContent()).toContain('Attempt 1 blocked');
    await page.keyboard.press('Space');await expect.poll(()=>page.locator('[data-press-announcement]').textContent()).toContain('Attempt 2 blocked');
    expect(await page.locator('[data-key]').getAttribute('transform')).toBe('translate(0 42.00)');
    const keyBounds=(await key.boundingBox())!,caption=(await page.locator('.written-rule').boundingBox())!,hintBounds=(await hint.boundingBox())!;
    expect(caption.y).toBeGreaterThanOrEqual(keyBounds.y+keyBounds.height-1);expect(hintBounds.y).toBeGreaterThanOrEqual(keyBounds.y+keyBounds.height+6);
    expect(caption.y).toBeGreaterThanOrEqual(hintBounds.y+hintBounds.height-1);expect(staticGap).toBeGreaterThanOrEqual(hintBounds.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await key.evaluate(e=>e.blur());
    for(let i=0;i<8;i++) await page.locator('.fork-control').click();await page.locator('.faq-item summary').first().click();
    await docs.click();expect(await page.getByRole('heading',{name:'Use TENET in Pi.'}).isVisible()).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  });
});
for(const width of [320,390,640,900,1280]) test(`marketing story and native navigation reflow at ${width}px`,async()=> {
  await withPage(width,false,async(page,errors)=> {
    await page.goto(origin);
    for(const name of ['1. Write your rule in TENET.md in plain text.','Before you start','Start with your own rule.']) expect(await page.getByRole('heading',{name,exact:true}).isVisible()).toBe(true);
    expect(await page.getByRole('link',{name:'Read the setup guide',exact:true}).getAttribute('href')).toBe('./docs.html#setup');
    expect(await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link').allTextContents()).toEqual(['How it works','FAQ','Docs']);
    await page.keyboard.press('Tab');expect(await page.getByRole('link',{name:'Skip to content'}).evaluate(e=>e===document.activeElement)).toBe(true);
    await page.keyboard.press('Enter');expect(await page.locator('main').evaluate(e=>e===document.activeElement)).toBe(true);
    await page.getByRole('navigation',{name:'Footer navigation'}).getByRole('link',{name:'FAQ',exact:true}).focus();await page.keyboard.press('Enter');expect(new URL(page.url()).hash).toBe('#faq');
    const first=page.locator('.faq-item summary').first();await first.focus();await page.keyboard.press('Enter');expect(await page.locator('.faq-item').first().getAttribute('open')).toBe('');
    expect(await page.getByText('No. Observe is the default.',{exact:false}).isVisible()).toBe(true);await page.keyboard.press('Space');expect(await page.locator('.faq-item').first().getAttribute('open')).toBeNull();
    expect(await page.locator('.faq-item').count()).toBe(5);for(const summary of await page.locator('.faq-item summary').all()) {await summary.click();expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
    expect(await page.locator('.closing-mark').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(48);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const control of await page.locator('.marketing-page a:visible, .marketing-header a:visible').all()) {expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);expect((await control.boundingBox())!.width).toBeGreaterThanOrEqual(44);}
    expect(errors).toEqual([]);
  });
});
for(const width of [320,390,640,900,1280]) test(`local story examples are keyboard usable and never assess or change settings at ${width}px`,async()=> {
  await withPage(width,true,async(page,errors)=> {
    await page.goto(origin);const policy=page.locator('.fork-demonstration'),control=policy.locator('.fork-control');await control.waitFor();
    const before=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),requests:string[]=[];
    page.on('request',r=>requests.push(`${r.method()} ${r.url()}`));const bounds=(await policy.locator('.fork-stage').boundingBox())!;
    await control.focus();for(let i=0;i<4;i++) await page.keyboard.press('Enter');
    expect(await control.evaluate(e=>({visible:e.matches(':focus-visible'),color:getComputedStyle(e).outlineColor}))).toEqual({visible:true,color:'rgb(23, 23, 23)'});
    expect(await policy.locator('.fork-preview').textContent()).toBe('Path(…).unlink()');expect((await policy.locator('.fork-stage').boundingBox())!.height).toBeCloseTo(bounds.height,1);
    for(let i=0;i<4;i++) await page.keyboard.press('Space');expect(await policy.locator('.fork-rule').textContent()).toBe('Never delete production data.');expect(await policy.locator('.fork-preview').textContent()).toBe('write({ content: "[]" })');
    await expectFocusedHomepage(page);expect(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).toEqual(before);expect(requests).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);expect((await control.boundingBox())!.width).toBeGreaterThanOrEqual(44);expect(errors).toEqual([]);
  });
});
for(const width of [320,390,640,900,1280]) test(`story illustrations and captions do not move on hydration at ${width}px`,async()=> {
  await withPage(width,true,async page=> {
    let hydrate!:()=>void;const hydration=new Promise<void>(resolve=>{hydrate=resolve;});await page.route('**/*.js',async route=>{await hydration;await route.continue();});
    await page.goto(origin,{waitUntil:'commit'});await page.locator('.fork-rule').waitFor();await page.evaluate(()=>document.fonts.ready);expect(await page.locator('.fork-control:visible').count()).toBe(0);
    const selectors=['.fork-demonstration','.fork-stage','.fork-heading','.fork-outcomes'],before=await Promise.all(selectors.map(s=>page.locator(s).boundingBox()));hydrate();await page.locator('.fork-control').waitFor();
    const after=await Promise.all(selectors.map(s=>page.locator(s).boundingBox()));for(let i=0;i<before.length;i++) {expect(after[i]!.height).toBeCloseTo(before[i]!.height,1);expect(after[i]!.y-after[0]!.y).toBeCloseTo(before[i]!.y-before[0]!.y,1);}
  });
});
test('the bounded key motion settles safely when the motion preference changes',async()=> {
  await withPage(1280,true,async(page,errors)=> {
    await page.goto(origin);const key=page.getByRole('button',{name:'Try pressing delete'});await key.waitFor();expect(await page.locator('.hero-feedback, .hero-limit, .alpha-note, [data-motion-control]').count()).toBe(0);
    for(let i=0;i<3;i++) await key.click();await expect.poll(()=>page.locator('[data-press-announcement]').textContent()).toContain('Attempt 3 blocked');await page.emulateMedia({reducedMotion:'reduce'});
    await expect.poll(()=>page.locator('[data-keypress]').getAttribute('data-motion')).toBe('finished');expect(await page.locator('[data-key]').getAttribute('transform')).toBe('translate(0 42.00)');
    await page.emulateMedia({reducedMotion:'no-preference'});expect(await page.locator('[data-keypress]').getAttribute('data-motion')).toBe('finished');expect(errors).toEqual([]);
  },'no-preference');
});
for(const width of [320,390,640,900,1280]) test(`the selected scene keeps accessible paired snapshots at ${width}px`,async()=> {
  await withPage(width,true,async(page,errors)=> {
    await page.goto(origin);const policy=page.locator('.fork-demonstration'),control=policy.locator('.fork-control');await control.waitFor();
    await expect.poll(()=>policy.getAttribute('data-fork-phase')).toBe('lost');const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
    const storage=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),bounds=(await policy.boundingBox())!;
    const previews=['write({ content: "[]" })','rm production/customers.json','Path(…).unlink()','find production … -delete'];
    expect(await policy.locator('figcaption, details, .policy-transport, .policy-qualification').count()).toBe(0);expect(await policy.getByRole('button').count()).toBe(1);
    expect((await control.boundingBox())!.width).toBeGreaterThanOrEqual(44);expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for(let i=0;i<4;i++) {
      expect(await policy.locator('.fork-preview').textContent()).toBe(previews[i]);
      expect(await policy.getAttribute('data-fork-phase')).toBe('lost');expect(await policy.locator('.fork-data-without').textContent()).toBe(i===0?'[]':'File removed');
      expect(await policy.locator('.fork-data-with').textContent()).toBe('[\n  { "id": "example" }\n]');
      await control.focus();await page.keyboard.press('Enter');expect(await policy.getAttribute('data-fork-phase')).toBe('blocked');await expectForkStop(page);
      expect(await policy.locator('.fork-verdict').textContent()).toBe('Would block');expect((await policy.boundingBox())!.height).toBeCloseTo(bounds.height,1);
      expect(await policy.locator('.fork-stage').evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);await page.keyboard.press('Space');expect(await control.evaluate(e=>e===document.activeElement&&e.matches(':focus-visible'))).toBe(true);
    }
    expect(await policy.locator('.fork-preview').textContent()).toBe(previews[0]);expect(await policy.innerText()).not.toMatch(/Verified|reliably understood|all methods|hidden intent|Destructive example|Unchanged in this illustration/);expect(await page.locator('.fork-heading').innerText()).not.toContain('fictional data');
    expect(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).toEqual(storage);expect(requests).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  });
});
test('the story suspends its actual native clock and every frame writer',async()=> {
  await withPage(1280,true,async(page,errors)=> {
    await page.goto(origin);const policy=page.locator('.fork-demonstration'),stage=policy,clock=policy.locator('.fork-stage'),art=policy.locator('.fork-circuit');
    await expect.poll(()=>stage.getAttribute('data-fork-playback')).toBe('waiting');expect(await clock.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
    await art.scrollIntoViewIfNeeded();await expect.poll(()=>stage.getAttribute('data-fork-playback')).toBe('playing');
    const state=()=>clock.evaluate(async e=> {const a=e.getAnimations({subtree:true});await Promise.all(a.map(a=>a.ready));return {time:a.map(a=>Number(a.currentTime)),art:e.innerHTML};});
    const control=policy.locator('.fork-control');await control.focus();await page.keyboard.press('Enter');expect(await control.getAttribute('aria-label')).toBe('Resume comparison');expect(await control.evaluate(e=>e===document.activeElement)).toBe(true);
    const paused=await state();expect(paused.time).toHaveLength(1);await page.waitForTimeout(180);expect(await state()).toEqual(paused);await control.click();await expect.poll(async()=>(await state()).time[0]).toBeGreaterThan(paused.time[0]);
    await art.evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().bottom+4,behavior:'instant'}));await page.waitForTimeout(100);
    const offscreen=await state();await page.waitForTimeout(180);expect(await state()).toEqual(offscreen);await art.scrollIntoViewIfNeeded();
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    const hidden=await state();await page.waitForTimeout(180);expect(await state()).toEqual(hidden);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await control.focus();await page.keyboard.press('Enter');await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>stage.getAttribute('data-fork-playback')).toBe('static');
    expect((await state()).time).toEqual([]);expect(await control.evaluate(e=>e===document.activeElement)).toBe(true);await expectForkStop(page);
    await page.emulateMedia({reducedMotion:'no-preference'});expect(await stage.getAttribute('data-fork-playback')).toBe('static');await page.waitForTimeout(100);expect((await state()).time).toEqual([]);
    await control.click();expect(await stage.getAttribute('data-fork-playback')).toBe('playing');expect((await state()).time.length).toBe(1);expect(await policy.locator('details, figcaption, .policy-transport').count()).toBe(0);expect(errors).toEqual([]);
  },'no-preference');
});

test('the selected fork preserves exact native pause time before pause readiness settles',async()=> {
  await withPage(1280,true,async(page,errors)=> {
    await page.goto(origin);const scene=page.locator('.fork-demonstration');await scene.locator('.fork-circuit').scrollIntoViewIfNeeded();
    await expect.poll(()=>scene.getAttribute('data-fork-playback')).toBe('playing');
    const paused=await scene.evaluate(async root=> {
      const animations=root.getAnimations({subtree:true});
      if(animations.length!==1) throw new Error(`Expected one scene clock, got ${animations.length}`);
      const animation=animations[0];await animation.ready;animation.currentTime=337.25;
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
      const snapshot=()=>({time:Number(animation.currentTime),art:root.querySelector('.fork-circuit')!.innerHTML,data:root.querySelector('.fork-data-without')!.textContent});
      const immediate=snapshot();await animation.ready;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      return {immediate,settled:snapshot()};
    });
    expect(paused.immediate.time).toBe(337.25);expect(paused.immediate.data).toBe('[\n  { "id": "example" }\n]');expect(paused.settled).toEqual(paused.immediate);expect(errors).toEqual([]);
  },'no-preference');
});
