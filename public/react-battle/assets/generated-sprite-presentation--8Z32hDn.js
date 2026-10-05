import{a as e,i as t,n,r}from"./sprite-catalog-CVIOF3YH.js";function i(e){let t=String(e||``).replace(/\bRelic pouch\b/g,`Inventory`).replace(/\brelic pouch\b/g,`inventory`).replace(/\bOpen Gear\b/g,`Open Inventory`).replace(/\ba relic\b/g,`an item`).replace(/\bthis relic\b/g,`this item`).replace(/\bTempering\b/g,`upgrading`).replace(/\bTemper\b/g,`Upgrade`).replace(/\bTempered (?=.+? to \d+\/\d+)/g,`Upgraded `);return t=t.replace(/^(\s*)Gear(\s*)$/,`$1Inventory$2`),t}function a(e=document.body){if(!e||!globalThis.NodeFilter)return;let t=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n=t.nextNode();for(;n;){if(!n.parentElement?.closest(`.stream-entry-chat, script, style, textarea`)){let e=i(n.nodeValue);e!==n.nodeValue&&(n.nodeValue=e)}n=t.nextNode()}}if(globalThis.document){let e=()=>a(document.body),t=new MutationObserver(e),n=()=>{e(),t.observe(document.body,{childList:!0,subtree:!0,characterData:!0})};document.body?n():window.addEventListener(`DOMContentLoaded`,n,{once:!0}),window.addEventListener(`beforeunload`,()=>t.disconnect(),{once:!0})}var o=Object.freeze({common:Object.freeze({tier:1,label:`Common`}),uncommon:Object.freeze({tier:2,label:`Uncommon`}),rare:Object.freeze({tier:3,label:`Rare`}),epic:Object.freeze({tier:4,label:`Epic`}),legendary:Object.freeze({tier:5,label:`Legendary`}),mythic:Object.freeze({tier:6,label:`Mythic`})});function s(e){for(let t of Object.keys(o))if(e.classList.contains(`rarity-${t}`))return t;return null}function c(e=document){for(let t of e.querySelectorAll(`[class*="rarity-"]`)){let e=s(t);if(!e)continue;let n=o[e];t.dataset.rarity=e,t.dataset.rarityTier=String(n.tier);for(let e of t.querySelectorAll(`.rarity-badge`)){let t=String(e.textContent||``),r=t.match(/(?:Tier|T)\s*\d+/i)?t.replace(/(?:Tier|T)\s*\d+/i,e=>e.toLowerCase().startsWith(`tier`)?`Tier ${n.tier}`:`T${n.tier}`):`${n.label} · T${n.tier}`;r!==t&&(e.textContent=r)}}}if(globalThis.document){let e=document.createElement(`style`);e.dataset.rarityContract=`v1`,e.textContent=`
    :root { --mythic:#ff78e8; }
    .rarity-mythic { --rarity-color:var(--mythic); box-shadow:0 0 30px rgba(255,120,232,.14); }
    .thread-gear-row.rarity-mythic { --rarity-color:var(--mythic); }
    .rarity-mythic .rarity-badge { border-color:color-mix(in srgb,var(--mythic) 54%,transparent); background:color-mix(in srgb,var(--mythic) 12%,transparent); }
  `,document.head.append(e),document.documentElement.dataset.rarityContract=`common-uncommon-rare-epic-legendary-mythic`;let t=()=>c(document),n=new MutationObserver(t),r=()=>{t(),n.observe(document.body,{childList:!0,subtree:!0})};document.body?r():window.addEventListener(`DOMContentLoaded`,r,{once:!0}),window.addEventListener(`beforeunload`,()=>n.disconnect(),{once:!0})}var l=[[/\bThread Dust\b/g,`Gold`],[/([+−-]?\d+(?:\.\d+)?)\s+Dust\b/g,`$1 Gold`],[/\bDust\b/g,`Gold`]];function u(e){return l.reduce((e,[t,n])=>e.replace(t,n),String(e||``))}function d(e=document.body){if(!e||!globalThis.NodeFilter)return;let t=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n=t.nextNode();for(;n;){if(!n.parentElement?.closest(`.stream-entry-chat, script, style, textarea`)){let e=u(n.nodeValue);e!==n.nodeValue&&(n.nodeValue=e)}n=t.nextNode()}}if(globalThis.document){let e=()=>d(document.body),t=new MutationObserver(e),n=()=>{e(),t.observe(document.body,{childList:!0,subtree:!0,characterData:!0})};document.body?n():window.addEventListener(`DOMContentLoaded`,n,{once:!0}),window.addEventListener(`beforeunload`,()=>t.disconnect(),{once:!0})}var f=document.querySelector(`#stream`);if(f){let i=document.createElement(`style`);i.textContent=`
    /* Generated art stays presentation-only. Semantic catalog IDs resolve to runtime
       assets; browser presentation does not crop legacy atlas sheets. */
    #stream .thread-generated-sprite,
    #inventory .thread-generated-sprite {
      display:inline-block;
      flex:0 0 auto;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.09);
      border-radius:9px;
      background-color:#11141b;
      background-clip:padding-box;
      box-shadow:inset 0 0 0 1px rgba(0,0,0,.22);
    }
    #stream .stream-health-unit .thread-generated-sprite {
      width:32px;
      min-width:32px;
      align-self:center;
    }
    #stream .thread-status-unit .thread-generated-sprite,
    #stream .thread-generated-status-sprite {
      width:38px;
      min-width:38px;
    }
    #stream .thread-generated-item-sprite,
    #inventory .thread-generated-item-sprite {
      width:38px;
      min-width:38px;
      align-self:center;
    }
    #stream .stream-hunt-visual {
      display:grid;
      grid-template-columns:44px minmax(0,1fr);
      gap:9px;
      align-items:center;
      margin-top:7px;
      padding:8px;
      border:1px solid rgba(179,109,255,.18);
      border-radius:10px;
      background:linear-gradient(145deg,rgba(179,109,255,.075),rgba(5,10,20,.38));
    }
    #stream .stream-hunt-visual .thread-generated-sprite {
      width:44px;
      min-width:44px;
      border-color:rgba(179,109,255,.25);
      background-color:#181425;
    }
    #stream .stream-hunt-copy {
      min-width:0;
      display:grid;
      gap:2px;
    }
    #stream .stream-hunt-copy > span {
      color:#a98eff;
      font-size:.53rem;
      font-weight:900;
      letter-spacing:.1em;
    }
    #stream .stream-hunt-copy > strong {
      overflow:hidden;
      color:var(--text,#f5f6f8);
      font-size:.76rem;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    #stream .stream-hunt-copy > small {
      color:var(--muted,#a8abb4);
      font-size:.64rem;
      line-height:1.35;
    }
    #stream .stream-hunt-ledger { display:flex; flex-wrap:wrap; gap:5px; margin-top:3px; }
    #stream .stream-hunt-chip { padding:2px 6px; border-radius:5px; background:#171922; color:#d6d7dc; font-size:.61rem; font-weight:800; font-variant-numeric:tabular-nums; }
    #stream .stream-hunt-chip.loss { color:#ff7c89; }
    #stream .stream-hunt-chip.reward { color:#f0c35b; }
    #stream .stream-hunt-chip.health { color:#83dfae; }
    #stream .stream-hunt-chip.progress { color:#7fd7ff; }
    #stream .stream-hunt-chip.level { color:#d9b8ff; border:1px solid rgba(179,109,255,.25); background:rgba(179,109,255,.08); }
    #stream .stream-hunt-loot { display:grid; grid-template-columns:28px minmax(0,1fr); gap:6px; align-items:center; margin-top:5px; color:#c8cad2; font-size:.62rem; }
    #stream .stream-hunt-loot .thread-generated-sprite { width:28px; min-width:28px; }
    #stream .stream-hunt-quest { color:#7fd7ff; }
    @media (max-width:520px) {
      #stream .stream-health-unit .thread-generated-sprite { width:28px; min-width:28px; }
      #stream .stream-hunt-visual { grid-template-columns:40px minmax(0,1fr); gap:8px; padding:7px; }
      #stream .stream-hunt-visual .thread-generated-sprite { width:40px; min-width:40px; }
      #stream .thread-generated-item-sprite,
      #inventory .thread-generated-item-sprite { width:34px; min-width:34px; }
    }
  `,document.head.append(i);let a=null,o=new Map,s=null,c=!1,l=!1;async function u(e){let t=await fetch(e,{headers:{Accept:`application/json`}}),n=await t.json();if(!t.ok)throw Error(n.message||`Request failed (${t.status})`);return n}function d(e){return String(e||``).trim().toLowerCase().replace(/[^a-z0-9]+/g,`-`).replace(/^-|-$/g,``)}function p(e){return String(e||``).split(/[-_]/g).filter(Boolean).map(e=>e[0]?.toUpperCase()+e.slice(1)).join(` `)}function m(e,t,{className:r=``,testId:i=null,label:a=``}={}){if(!e||e.dataset.generatedSpriteReplaced===`true`)return e;let o=n(t,{className:r,testId:i,label:a});for(let t of e.classList)o.classList.add(t);return e.dataset.testid&&!o.dataset.testid&&(o.dataset.testid=e.dataset.testid),e.dataset.generatedSpriteReplaced=`true`,e.replaceWith(o),o}function h(e){let t=e.closest(`.stream-entry[data-entry-id]`);return t&&o.get(t.dataset.entryId)||null}function g(e){let t=h(e)?.metadata||{},n=e.querySelector(`.stream-health-top strong, strong`)?.textContent?.trim()||t.enemyName||`Enemy`,r=e.querySelector(`.stream-health-label, span`)?.textContent||``;return{id:t.enemyId||t.defeatedEnemyId||d(n),name:n,visualAssetId:t.enemyVisualAssetId||t.defeatedEnemyVisualAssetId||t.nextEnemyVisualAssetId||null,isBoss:!!(t.defeatedBoss||t.enemy?.isBoss||/boss/i.test(r))}}function _(){let t=a?.character?.id||a?.threadedUser?.id||`threadbound-weaver`;for(let n of f.querySelectorAll(`.stream-health-unit`)){let i=n.querySelector(`img`);if(i){if(n.classList.contains(`enemy`)){let e=g(n);m(i,r(e),{className:`generated-enemy-sprite`,testId:`stream-generated-enemy-sprite`,label:e.name})}else m(i,e(t),{className:`generated-weaver-sprite`,testId:`stream-generated-weaver-sprite`,label:a?.character?.displayName||`Weaver`})}}}function v(){let t=a?.character?.id||a?.threadedUser?.id||`threadbound-weaver`,n=f.querySelector(`[data-testid="stream-weaver-sprite"]`);n?.tagName===`IMG`&&m(n,e(t),{className:`thread-generated-status-sprite generated-weaver-sprite`,testId:`stream-weaver-sprite`,label:a?.character?.displayName||`Weaver`});for(let e of f.querySelectorAll(`.thread-status-unit.enemy`)){let t=e.querySelector(`img`);if(!t)continue;let n=e.querySelector(`strong`)?.textContent?.trim()||`Enemy`;m(t,r({id:d(n),name:n,isBoss:/boss/i.test(e.textContent)}),{className:`thread-generated-status-sprite generated-enemy-sprite`,testId:`stream-status-enemy-sprite`,label:n})}}function y(){for(let e of f.querySelectorAll(`.stream-entry-system[data-entry-id]`)){if(e.dataset.generatedHuntVisual===`true`)continue;let i=o.get(e.dataset.entryId);if(i?.eventType!==`HuntResolved`)continue;let a=i.metadata||{},s=e.querySelector(`.stream-entry-content`);if(!s)continue;let c=s.querySelector(`:scope > p`);c&&c.classList.add(`sr-only`);let l=document.createElement(`div`);l.className=`stream-hunt-visual`,l.dataset.testid=`stream-hunt-visual`;let u=a.enemyName||`Hunt enemy`;l.append(n(r({id:a.enemyId,name:u,visualAssetId:a.enemyVisualAssetId}),{className:`stream-hunt-sprite generated-enemy-sprite`,testId:`stream-hunt-sprite`,label:`${u} artwork`}));let d=document.createElement(`div`);d.className=`stream-hunt-copy`;let f=document.createElement(`span`);f.textContent=a.victory?`HUNT CLEARED`:`HUNT FAILED`;let m=document.createElement(`strong`);m.textContent=u;let h=document.createElement(`div`);h.className=`stream-hunt-ledger`;let g=(e,t)=>{let n=document.createElement(`span`);return n.className=`stream-hunt-chip ${t}`,n.textContent=e,n},_=Number(a.gold??a.threadDust??0),v=Number(a.experienceGained??a.xp??0);if(h.append(g(`−${a.damageTaken||0} HP`,`loss`),g(`${a.remainingHp}/${a.maxHp} HP`,`health`),g(a.victory?`+${_} Gold`:`No reward`,`reward`)),a.victory&&v>0&&h.append(g(`+${v} XP`,`progress`)),a.leveledUp&&h.append(g(`LEVEL ${a.level}!`,`level`)),d.append(f,m,h),a.itemName){let e=document.createElement(`div`);e.className=`stream-hunt-loot`;let r=b(a.itemName)||{id:a.itemId,name:a.itemName};e.append(n(t(r),{className:`thread-generated-item-sprite`,label:a.itemName}));let i=document.createElement(`span`);i.textContent=`${a.itemRarity?`${p(a.itemRarity)} · `:``}${a.itemName} · +${a.itemAttackBonus||0} Attack`,e.append(i),d.append(e)}if(a.healthPotionsFound){let e=document.createElement(`div`);e.className=`stream-hunt-loot`,e.append(n(t({visualAssetId:`item.health-potion.v1`,id:`health-potion`,name:`Health Potion`}),{className:`thread-generated-item-sprite`,label:`Health Potion`}));let r=document.createElement(`span`);r.textContent=`+1 health potion`,e.append(r),d.append(e)}for(let e of Array.isArray(a.questProgress)?a.questProgress:[]){let r=String(e?.questName||e?.name||``).trim();if(!r)continue;let i=Math.max(0,Number(e.current)||0),a=Math.max(i,Number(e.required)||0),o=document.createElement(`div`);o.className=`stream-hunt-loot stream-hunt-quest`,o.append(n(t({visualAssetId:`item.quest-scroll.v1`,id:`hunt-quest-progress`,name:`Quest`}),{className:`thread-generated-item-sprite`,label:`Quest progress`}));let s=document.createElement(`span`);s.textContent=e.completed?`Quest complete · ${r}`:a>0?`Quest · ${r} ${i}/${a}`:`Quest · ${r}`,o.append(s),d.append(o)}l.append(d),s.append(l),e.dataset.generatedHuntVisual=`true`}}function b(e){return a?.inventory?.find(t=>String(t.name)===String(e))||null}function x(){if(!a)return;document.querySelectorAll(`#inventory [data-testid="inventory-item"]`).forEach((e,n)=>{let r=e.querySelector(`img[src="/sprites/relic.svg"]`),i=a.inventory?.[n];r&&i&&m(r,t(i),{className:`thread-generated-item-sprite generated-item-sprite`,testId:`generated-inventory-item-sprite`,label:i.name})});for(let e of f.querySelectorAll(`.thread-gear-row`)){let n=e.querySelector(`img[src="/sprites/relic.svg"]`);if(!n)continue;let r=e.querySelector(`.thread-gear-copy strong`)?.textContent?.trim(),i=b(r);i&&m(n,t(i),{className:`thread-generated-item-sprite generated-item-sprite`,testId:`stream-generated-item-sprite`,label:i.name})}let e=f.querySelector(`.thread-loadout-line`)?.querySelector(`img[src="/sprites/relic.svg"]`);e&&a.character?.equippedItem&&m(e,t(a.character.equippedItem),{className:`thread-generated-item-sprite generated-item-sprite`,testId:`stream-equipped-item-sprite`,label:a.character.equippedItem.name})}function S(){_(),v(),y(),x()}async function C(){if(c){l=!0;return}c=!0;try{let[e,t]=await Promise.all([u(`/api/dashboard`),u(`/api/stream?limit=100`)]);a=e,o=new Map((t.entries||[]).map(e=>[e.id,e])),S()}catch{}finally{c=!1,l&&(l=!1,queueMicrotask(()=>C()))}}function w(e=60){clearTimeout(s),s=setTimeout(()=>C(),e)}let T=new MutationObserver(()=>w());T.observe(document.body,{childList:!0,subtree:!0}),window.addEventListener(`threadbound:activity`,()=>w(25)),window.addEventListener(`threadbound:context-refresh`,()=>w(25)),window.addEventListener(`beforeunload`,()=>T.disconnect(),{once:!0}),await C()}