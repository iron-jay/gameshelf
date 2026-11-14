/**
 * A JSON body as the form the web's action reads, so the API is read by the
 * same rules (`lib/versions/details.ts`): strings and numbers by name, the rest
 * left out.
 */
export function formFrom(values: Record<string, unknown>, names: readonly string[]): FormData {
  const form = new FormData();
  for (const name of names) {
    const value = values[name];
    if (typeof value === "string") form.set(name, value);
    else if (typeof value === "number") form.set(name, String(value));
  }
  return form;
}
