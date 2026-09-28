/** Erro com status HTTP e mensagem pronta para a pessoa ler. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} não encontrado.`);
export const badRequest = (message: string, detail?: unknown) => new HttpError(400, message, detail);
export const conflict = (message: string, detail?: unknown) => new HttpError(409, message, detail);
export const forbidden = (message = 'Você não tem permissão para esta ação.') => new HttpError(403, message);
