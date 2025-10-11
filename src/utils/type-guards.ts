/**
 * Type guard to check if a value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Convert unknown error value to Error object
 * Handles various error formats safely
 */
export function toError(value: unknown): Error {
  if (isError(value)) {
    return value;
  }
  
  if (typeof value === 'string') {
    return new Error(value);
  }
  
  if (typeof value === 'object' && value !== null) {
    // Handle error-like objects
    const errorObj = value as Record<string, unknown>;
    if ('message' in errorObj && typeof errorObj.message === 'string') {
      return new Error(errorObj.message);
    }
  }
  
  // Fallback for unknown error types
  return new Error(String(value));
}

/**
 * Type guard for validating message data structure
 */
export function isMessageData<T>(
  data: unknown,
  validator: (data: unknown) => boolean
): data is T {
  return validator(data);
}

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Check if value has a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

/**
 * Type guard for GetTrackerInfo message data
 */
export function isGetTrackerInfoData(
  data: unknown
): data is { domain: string } {
  return (
    isObject(data) &&
    hasProperty(data, 'domain') &&
    typeof data.domain === 'string'
  );
}

/**
 * Type guard for ConsentScanResult
 */
export function isConsentScanResult(data: unknown): data is {
  url: string;
  hasBanner: boolean;
  hasRejectButton: boolean;
  isCompliant: boolean;
  deceptivePatterns: string[];
  timestamp: number;
} {
  return (
    isObject(data) &&
    hasProperty(data, 'url') &&
    typeof data.url === 'string' &&
    hasProperty(data, 'hasBanner') &&
    typeof data.hasBanner === 'boolean' &&
    hasProperty(data, 'hasRejectButton') &&
    typeof data.hasRejectButton === 'boolean' &&
    hasProperty(data, 'isCompliant') &&
    typeof data.isCompliant === 'boolean' &&
    hasProperty(data, 'deceptivePatterns') &&
    Array.isArray(data.deceptivePatterns) &&
    hasProperty(data, 'timestamp') &&
    typeof data.timestamp === 'number'
  );
}

