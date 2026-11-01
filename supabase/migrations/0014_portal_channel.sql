-- Fresh TMS — wiadomość z portalu klienta (tekst albo nagranie) jako kanał przyjęcia zamówienia.
-- Osobny plik: nowej wartości enuma nie można użyć w tej samej transakcji.
alter type intake_channel add value if not exists 'portal';
