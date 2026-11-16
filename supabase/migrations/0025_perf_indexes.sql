-- Indeksy na kluczach obcych używanych w złączeniach i filtrach (trasy, zdarzenia, opakowania, gotówka).
-- Bez nich każde "pokaż zdarzenia trasy" czy "zlecenia punktu" przeglądało całą tabelę.
create index if not exists memberships_user_id_idx on public.memberships (user_id);
create index if not exists routes_driver_id_idx on public.routes (driver_id);
create index if not exists routes_vehicle_id_idx on public.routes (vehicle_id);
create index if not exists route_stops_delivery_point_id_idx on public.route_stops (delivery_point_id);
create index if not exists orders_delivery_point_id_idx on public.orders (delivery_point_id);
create index if not exists orders_parent_order_id_idx on public.orders (parent_order_id);
create index if not exists order_lines_product_id_idx on public.order_lines (product_id);
create index if not exists delivery_events_route_id_idx on public.delivery_events (route_id);
create index if not exists delivery_events_stop_id_idx on public.delivery_events (stop_id);
create index if not exists packaging_movements_route_id_idx on public.packaging_movements (route_id);
create index if not exists packaging_movements_stop_id_idx on public.packaging_movements (stop_id);
create index if not exists packaging_movements_type_id_idx on public.packaging_movements (packaging_type_id);
create index if not exists cash_movements_route_id_idx on public.cash_movements (route_id);
create index if not exists cash_movements_stop_id_idx on public.cash_movements (stop_id);
create index if not exists cash_movements_order_id_idx on public.cash_movements (order_id);
create index if not exists delivery_points_customer_id_idx on public.delivery_points (customer_id);
create index if not exists drivers_user_id_idx on public.drivers (user_id);
create index if not exists route_templates_default_driver_id_idx on public.route_templates (default_driver_id);
create index if not exists route_templates_default_vehicle_id_idx on public.route_templates (default_vehicle_id);
create index if not exists route_template_points_delivery_point_id_idx on public.route_template_points (delivery_point_id);
