/* aio-libs-local stub */

export class AioLibError extends Error {
  code: string;
  sdk?: string;
  sdkDetails?: unknown;

  constructor(code: string, message: string, sdkDetails?: unknown) {
    super(message);
    this.name = "AioLibError";
    this.code = code;
    this.sdk = "AioLibsLocal";
    this.sdkDetails = sdkDetails;
  }
}

export const ERROR_BAD_REQUEST = "ERROR_BAD_REQUEST";
export const ERROR_BAD_ARGUMENT = "ERROR_BAD_ARGUMENT";
export const ERROR_BAD_FILE_NAME = "ERROR_BAD_FILE_NAME";
export const ERROR_FILE_NOT_EXISTS = "ERROR_FILE_NOT_EXISTS";
export const ERROR_PAYLOAD_TOO_LARGE = "ERROR_PAYLOAD_TOO_LARGE";
export const ERROR_UNAUTHORIZED = "ERROR_UNAUTHORIZED";
export const ERROR_BAD_FILE_TYPE = "ERROR_BAD_FILE_TYPE";
export const ERROR_OUT_OF_RANGE = "ERROR_OUT_OF_RANGE";
export const ERROR_NOT_IMPLEMENTED = "ERROR_NOT_IMPLEMENTED";

export function throwError(code: string, message: string, sdkDetails?: unknown): never {
  throw new AioLibError(code, message, sdkDetails);
}
