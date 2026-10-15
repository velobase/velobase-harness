/**
 * Base error class for chat-related errors
 */
export class ChatError extends Error {
  public readonly code: string;
  public readonly retryAfter?: number;

  constructor(code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, ChatError.prototype);
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitExceededError extends ChatError {
  constructor(message = 'Rate limit exceeded', retryAfter?: number) {
    super('RATE_LIMIT_EXCEEDED', message, retryAfter);
    this.name = 'RateLimitExceededError';
    Object.setPrototypeOf(this, RateLimitExceededError.prototype);
  }
}

/**
 * Guest conversation limit exceeded error
 */
export class GuestConversationLimitExceededError extends ChatError {
  constructor(message = 'Guest conversation limit reached') {
    super('GUEST_CONVERSATION_LIMIT_EXCEEDED', message);
    this.name = 'GuestConversationLimitExceededError';
    Object.setPrototypeOf(this, GuestConversationLimitExceededError.prototype);
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends ChatError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Bad request error
 */
export class BadRequestError extends ChatError {
  constructor(message = 'Bad Request') {
    super('BAD_REQUEST', message);
    this.name = 'BadRequestError';
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * Not found error
 */
export class NotFoundError extends ChatError {
  constructor(message = 'Not Found') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
