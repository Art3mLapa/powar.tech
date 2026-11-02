import Image from 'next/image'
import Link from 'next/link'
import { Experience } from '@/components/experience'
import { Reveal } from '@/components/reveal'
import { SupportMethod, type SupportTone } from '@/components/support-method'
import { VideoPlayer } from '@/components/video-player'
import { CHANNEL_URL } from '@/lib/video-feed'
import { getLatestVideos } from '@/lib/youtube'

export const revalidate = 3600
const messages = [
	{
		image: 'message-1',
		width: 643,
		height: 142,
		text: 'подвал билдеров бсзп: дак билды в прогрузе пк нагружают',
	},
	{
		image: 'message-2',
		width: 860,
		height: 108,
		text: 'подвал билдеров бсзп: а вы шарите за сикс севен',
	},
	{
		image: 'message-3',
		width: 597,
		height: 108,
		text: 'подвал билдеров бсзп: иди нахуй',
	},
	{
		image: 'message-4',
		width: 693,
		height: 131,
		text: 'подвал билдеров бсзп: прошка фурри и чуть чуть фембой',
	},
	{
		image: 'message-5',
		width: 738,
		height: 134,
		text: 'подвал билдеров бсзп: переименуй сталкрафт мемы в сталкрафт фурри',
	},
	{
		image: 'message-6',
		width: 868,
		height: 144,
		text: 'подвал билдеров бсзп: я ленивое чмо сделал озвучку ролика недели 4 назад и не могу снять видооооос',
	},
]

const supportPeople: {
	name: string
	role: string
	methods: {
		label: string
		tone: SupportTone
		href?: string
		value?: string
	}[]
}[] = [
	{
		name: 'OARER',
		role: 'разработка сайта, со-овнер бсзп',
		methods: [
			{
				label: 'СБП/ТБАНК/РФ БАНК',
				tone: 'blue',
				href: 'https://pay.cloudtips.ru/p/4500e11c',
			},
			{
				label: 'USDT-TRC20',
				tone: 'red',
				value: 'UQCat9P5_Y0CDIz2_ofIaTE4t5VXSn9k8JtNzVZkUVm1oUtF',
			},
			{
				label: 'GRAM (EX. TON)',
				tone: 'blue',
				value: 'UQCat9P5_Y0CDIz2_ofIaTE4t5VXSn9k8JtNzVZkUVm1oUtF',
			},
		],
	},
	{
		name: 'АРТЕМИЙ ЛАПА',
		role: 'овнер бсзп',
		methods: [
			{
				label: 'КАРТЫ РФ',
				tone: 'blue',
				href: 'https://pay.cloudtips.ru/p/b8c1c6cc',
			},
		],
	},
	{
		name: 'ИГНАТ ЛЕБЯДКИН',
		role: 'датамайнер, со-овнер бсзп',
		methods: [
			{
				label: 'USDT-TRC20',
				tone: 'red',
				value: 'TUujZEHWZF7CScr6YyMw3Cx4TFJGCvwoEk',
			},
			{
				label: 'USDT-BEP20',
				tone: 'yellow',
				value: '0xf4352186edc069a1eaffa697d155c704f09185a5',
			},
		],
	},
]

function Message({ index }: { index: number }) {
	const message = messages[index]
	return (
		<Reveal className="message">
			<Image
				alt={message.text}
				height={message.height}
				loading="lazy"
				src={`/images/${message.image}.webp`}
				style={{ width: `${(message.width / 868) * 100}%` }}
				width={message.width}
			/>
		</Reveal>
	)
}

export default async function Home() {
	const videos = await getLatestVideos()
	return (
		<>
			<Link className="skip-link" href="#podval">
				К ссылкам и видео
			</Link>
			<main id="top">
				<Experience />
				<section
					aria-labelledby="telegram-title"
					className="telegram-section"
					id="podval"
				>
					<div className="telegram-content mx-auto">
						<Message index={0} />
						<Message index={1} />
						<Message index={2} />
						<Reveal className="section-link telegram-link">
							<h2 className="type-display" id="telegram-title">
								<Link
									href="https://bscp_podval.t.me"
									rel="noopener noreferrer"
									target="_blank"
								>
									BSCP_PODVAL.t.me
									<span className="sr-only">
										{' '}
										(откроется в новой вкладке)
									</span>
								</Link>
							</h2>
						</Reveal>
						<Message index={3} />
						<Message index={4} />
						<Message index={5} />
					</div>
				</section>
				<section
					aria-labelledby="youtube-title"
					className="youtube-section"
				>
					<div className="youtube-grid mx-auto">
						<Reveal className="youtube-comment">
							<Image
								alt="@buildersc_production: 🔥 Сталкрафтеры дуреют с этой прикормки 👉"
								height={157}
								loading="lazy"
								src="/images/youtube-comment.webp"
								width={575}
							/>
						</Reveal>
						<Reveal className="video-reveal video-first">
							<VideoPlayer video={videos[0]} />
						</Reveal>
						<Reveal className="section-link youtube-link">
							<h2 className="type-display" id="youtube-title">
								<Link
									href={CHANNEL_URL}
									rel="noopener noreferrer"
									target="_blank"
								>
									@buildersc_production
									<span className="sr-only">
										{' '}
										(откроется в новой вкладке)
									</span>
								</Link>
							</h2>
						</Reveal>
						<Reveal className="video-reveal video-second">
							<VideoPlayer video={videos[1]} />
						</Reveal>
					</div>
				</section>
				<nav aria-label="Разделы сайта" className="home-content-links">
					<Link href="/articles">Статьи</Link>
					<Link href="/patches">Патчи игры</Link>
				</nav>
				<section
					aria-labelledby="support-title"
					className="soon-section support-section flex items-center justify-center"
				>
					<div className="support-inner mx-auto">
						<Reveal className="support-heading text-center">
							<h2
								className="support-title type-display"
								id="support-title"
							>
								Саппорт БСЗП
							</h2>
							<p className="support-caption">
								(на домен, сервака, еду, оборудке,
								дом, учебу)
							</p>
						</Reveal>
						<div className="support-grid">
							{supportPeople.map((person) => (
								<Reveal
									className="support-person"
									key={person.name}
								>
									<p className="support-name type-display">
										{person.name}
									</p>
									<p className="support-role">
										{person.role}
									</p>
									<div className="support-methods">
										{person.methods.map((method) => (
											<SupportMethod
												key={method.label}
												{...method}
											/>
										))}
									</div>
								</Reveal>
							))}
						</div>
					</div>
				</section>
			</main>
		</>
	)
}
