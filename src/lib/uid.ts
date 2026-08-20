let counter = 0;

/**
 * Monotonic, collision-resistant id. Deliberately not random so that a test
 * run producing the same sequence of calls produces the same ids.
 */
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** Reset between tests so ids stay predictable. */
export function resetUid(): void {
  counter = 0;
}
