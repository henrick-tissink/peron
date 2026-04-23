export class CaptchaError extends Error {
  override readonly name = "CaptchaError";
}

export class UpstreamError extends Error {
  override readonly name = "UpstreamError";
  constructor(message: string, readonly httpStatus: number) {
    super(message);
  }
}

export class TokenExpiredError extends Error {
  override readonly name = "TokenExpiredError";
}

export class BootstrapError extends Error {
  override readonly name = "BootstrapError";
  constructor(message: string, readonly detail: string) {
    super(message);
  }
}
