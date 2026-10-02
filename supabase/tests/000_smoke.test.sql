-- Proves the pgTAP runner works. Schema tests arrive with T1.4.
begin;
select plan(1);

select has_schema('public', 'public schema exists');

select * from finish();
rollback;
