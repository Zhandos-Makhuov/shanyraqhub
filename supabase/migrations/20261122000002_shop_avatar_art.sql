-- Shanyraq Hub — shop avatar looks: drawn club artwork instead of random stock photos (owner decision 2026-11-20).
-- The pictures are part of the site (/shop/*.svg). The gold frame no longer shows the club logo as its
-- picture: like the other frames, the shop shows it on the member's own photo. Catalog rows only.
update public.shop_items set preview_url = '/shop/avatar-altyn.svg'   where id = 'item-avatar-altyn';
update public.shop_items set preview_url = '/shop/avatar-sage.svg'    where id = 'item-avatar-sage';
update public.shop_items set preview_url = '/shop/avatar-cyber.svg'   where id = 'item-avatar-cyber';
update public.shop_items set preview_url = '/shop/avatar-artisan.svg' where id = 'item-avatar-artisan';
update public.shop_items set preview_url = null where id = 'item-frame-shanyraq-gold';
