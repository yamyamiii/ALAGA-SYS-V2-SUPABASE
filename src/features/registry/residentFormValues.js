export function residentValuesForWrite(values, resident) {
  return {
    ...values,
    household_id: resident?.id ? (resident.household_id ?? null) : null,
  };
}
