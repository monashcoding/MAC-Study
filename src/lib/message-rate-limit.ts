// Turns the errors raised by the enforce_message_rate_limit trigger into a
// message people can act on. Returns null for any other error.
export function getMessageRateLimitError(errorMessage: string | undefined) {
  if (!errorMessage) return null;

  if (errorMessage.includes("MESSAGE_DUPLICATE")) {
    return {
      message: "You just sent that. Try saying something new.",
      retryAfterSeconds: null,
    };
  }

  const match = errorMessage.match(/MESSAGE_RATE_LIMIT:(\d+)/);
  if (!match) return null;

  const retryAfterSeconds = Math.max(1, Number.parseInt(match[1], 10));

  return {
    message: `You're sending messages too fast. Try again in ${retryAfterSeconds}s.`,
    retryAfterSeconds,
  };
}
