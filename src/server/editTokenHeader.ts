export const EDIT_TOKEN_HEADER = "x-cart-edit-token";

export function readEditToken(req: Request): string | null {
  return req.headers.get(EDIT_TOKEN_HEADER);
}
