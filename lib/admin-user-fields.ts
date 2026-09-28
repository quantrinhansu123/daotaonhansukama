const editableFields = [
  'displayName', 'role', 'position', 'departmentId', 'monthlySalary',
  'dateOfBirth', 'address', 'country', 'phoneNumber', 'workLocation',
  'photoURL', 'employmentStatus', 'employmentStartDate',
  'employmentMaritalStatus', 'employmentBranch', 'employmentTeam',
  'employmentSalaryPercentage', 'employmentActive', 'projects',
] as const;

export function profileFields(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of editableFields) {
    if (input[field] !== undefined) result[field] = input[field];
  }
  return result;
}
