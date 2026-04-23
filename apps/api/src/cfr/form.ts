export function toFormBody(fields: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    params.append(k, v);
  }
  return params;
}
