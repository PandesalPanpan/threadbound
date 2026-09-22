import { useState } from 'react';
import { resolveShellAsset } from '../../shell/presentation.js';
import { PanelButton, RichCard } from '../common/RichCard.jsx';

function ItemTile({ item, assets, owner = false, onRequest, busy = false, tooltipPrefix = 'shop' }) {
  const [open, setOpen] = useState(false);
  const asset = resolveShellAsset(item, assets, ['item', 'icon']);
  const id = `stream-item-tooltip-${String(tooltipPrefix)}-${item.id || item.sku}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const rarity = item.rarity || item.item?.rarity || 'common';
  const source = item.item || item;
  const itemName = item.name || source.name || 'Item';
  const slot = item.slot || source.slot || 'Equipment';
  const attack = Number(item.attackBonus ?? source.attackBonus ?? 0) || 0;
  const defense = Number(item.defenseBonus ?? source.defenseBonus ?? 0) || 0;
  const effect = source.effect?.description || source.effect?.name || null;
  const available = item.available !== false;
  const affordable = item.affordable !== false;
  return <article className={`stream-item-tile stream-item-tile--${rarity}${open ? ' is-open' : ''}`} data-testid="stream-shop-item" data-item-id={item.id || item.sku} data-available={available ? 'true' : 'false'}>
    <button type="button" className="stream-item-tile__button" aria-label={`Inspect ${itemName}`} aria-describedby={id} aria-controls={id} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {asset ? <img className="stream-item-tile__asset" src={asset.src} alt="" data-visual-asset-id={asset.id} /> : <span className="stream-item-tile__asset stream-item-tile__asset--fallback" aria-hidden="true">✦</span>}
      <span className="stream-item-tile__name">{itemName}</span><span className={`rarity-chip rarity-chip--${rarity}`}>{rarity}</span><span className="stream-item-tile__cost">{item.cost ?? 0} Gold</span>
    </button>
    <div className="stream-item-tooltip" id={id} role="tooltip"><strong>{itemName}</strong><span>{rarity} · {slot}</span><span>+{attack} Attack · +{defense} Defense</span>{effect ? <span>Effect · {effect}</span> : null}<span>{available ? (affordable ? 'Available and affordable' : 'Need more Gold') : 'Unavailable during the active Dungeon'}</span></div>
    {owner && open ? <div className="stream-item-tile__actions"><PanelButton primary disabled={busy || !available || !affordable} onClick={() => onRequest(`buy ${itemName}`, `/api/shop/purchases/${encodeURIComponent(item.sku)}`, { method: 'POST' })}>{!available ? 'Unavailable' : affordable ? 'Buy' : 'Need Gold'}</PanelButton></div> : null}
  </article>;
}

export function ShopSurface({ shop, assets = [], owner = false, actorName = 'the acting Weaver', onRequest, onCommand, busy = false, kicker = 'SHARED STREAM · /shop', title = '', subtitle = '', className = '', testId = 'stream-shop-rich-card' }) {
  if (!shop) return <RichCard kind="shop" kicker="SHOP" title="Shop"><p className="shell-muted-copy">The vendor could not be reached yet.</p></RichCard>;
  const offers = Array.isArray(shop.offers) ? shop.offers : [];
  const vendor = shop.vendor || {};
  const vendorAsset = resolveShellAsset(vendor, assets, ['character', 'npc']);
  return <RichCard kind="shop" kicker={kicker} title={title || vendor.name || 'Shop'} subtitle={subtitle || `${shop.currency?.balance ?? 0} Gold available · public catalog snapshot`} className={className} testId={testId}>
    <div className="stream-shop-vendor"><div className="stream-shop-vendor__portrait">{vendorAsset ? <img src={vendorAsset.src} alt="" data-visual-asset-id={vendorAsset.id} /> : <span aria-hidden="true">✦</span>}</div><div><strong>{vendor.tagline || 'Supplies and Equipment for the next thread.'}</strong><small>{shop.available === false ? (shop.unavailableReason || 'Unavailable right now.') : 'Catalog and prices are authoritative for this snapshot.'}</small></div><div className="stream-shop-balance"><span>GOLD</span><strong>{shop.currency?.balance ?? 0}</strong></div></div>
    {shop.unavailableReason ? <p className="stream-shop-unavailable" role="status">{shop.unavailableReason}</p> : null}
    {offers.length ? <div className="stream-item-grid">{offers.map((offer) => <ItemTile key={offer.sku} item={offer} assets={assets} owner={owner} onRequest={onRequest} busy={busy} tooltipPrefix={testId} />)}</div> : <p className="shell-muted-copy">No shop offers are available in this snapshot.</p>}
    <div className="stream-shop-heading"><strong>{owner ? 'Choose an offer to inspect, then Buy.' : `Only ${actorName} can purchase from this shared catalog.`}</strong><span>{offers.length} offer{offers.length === 1 ? '' : 's'} · balance {shop.currency?.balance ?? 0} Gold</span></div>
    {owner ? <div className="stream-shared-actions"><PanelButton onClick={() => onCommand?.('bank')}>Open Bank</PanelButton></div> : null}
  </RichCard>;
}
