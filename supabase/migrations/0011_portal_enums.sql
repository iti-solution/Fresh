-- Fresh TMS — portal zamówień klienta: nowa rola.
-- Osobny plik, bo nowej wartości enuma nie można użyć w tej samej transakcji (polityki w 0012).

alter type member_role add value if not exists 'customer'; -- klient hurtowni: tylko portal zamówień
