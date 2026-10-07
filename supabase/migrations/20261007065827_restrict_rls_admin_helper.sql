-- The hosted project may install this administrative event trigger automatically.
-- Keep its owner and trigger intact; browser clients must not call it as an RPC.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
