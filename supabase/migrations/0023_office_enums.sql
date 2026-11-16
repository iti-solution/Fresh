-- Etap „biuro” (R8): nowa rola tylko do Monitora tras (telewizor w dyspozytorni).
-- Osobna migracja: nowej wartości enum nie można użyć w tej samej transakcji, w której powstała.
alter type member_role add value if not exists 'monitor';
