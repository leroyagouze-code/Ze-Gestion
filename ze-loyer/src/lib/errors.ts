/** Erreur métier : son message est affiché tel quel à l'utilisateur. */
export class BusinessError extends Error {}

export class NotFoundError extends BusinessError {
  constructor(what = "Élément") {
    super(`${what} introuvable`);
  }
}

export class ForbiddenError extends BusinessError {
  constructor(message = "Vous n'avez pas accès à cette action.") {
    super(message);
  }
}
