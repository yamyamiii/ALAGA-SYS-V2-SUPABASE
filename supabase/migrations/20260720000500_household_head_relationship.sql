-- Add the circular relationship only after residents exists. The composite
-- foreign key guarantees the selected head is a member of this household.

alter table public.households
  add constraint households_head_is_member foreign key (head_resident_id, id)
  references public.residents (id, household_id)
  on update restrict
  on delete restrict;
