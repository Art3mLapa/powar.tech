export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public code = 'REQUEST_FAILED'
	) {
		super(message)
	}
}
export function requireValue<T>(
	value: T | null | undefined,
	status = 404,
	message = 'Не найдено'
): T {
	if (value === null || value === undefined)
		throw new ApiError(status, message)
	return value
}
