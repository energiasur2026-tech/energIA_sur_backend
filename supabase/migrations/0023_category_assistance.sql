-- Keep only a short, user-confirmed tariff field for categories absent from the catalog.
alter table public.user_meter_tariff_profiles add column if not exists category_text text not null default '';
alter table public.user_meter_tariff_profiles add constraint category_text_length check(length(category_text)<=120);
-- category='unknown' explicitly means the user does not yet know it; category='other'
-- means a known field has no catalog entry. No category or subsidy is inferred.
