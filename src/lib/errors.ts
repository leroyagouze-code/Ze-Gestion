export class BusinessError extends Error {}
export class NotFoundError extends BusinessError {
  constructor(what = "Élément") {
    super(`${what} introuvable`);
  }
}
