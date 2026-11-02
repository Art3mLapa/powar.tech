import axios from 'axios'

export const apiClient = axios.create({
	baseURL: '/api/v1',
	withCredentials: true,
	timeout: 20_000,
})
export function errorMessage(error: unknown): string {
	if (axios.isAxiosError(error))
		return (
			error.response?.data?.error?.message ??
			'Сервер недоступен. Попробуйте ещё раз.'
		)
	return error instanceof Error
		? error.message
		: 'Не удалось выполнить действие'
}
