export interface ErrorEnvelope {
  error: {
    code: string
    message: string
  }
}

export function errorEnvelope(code: string, message: string): ErrorEnvelope {
  return {
    error: {
      code,
      message,
    },
  }
}
