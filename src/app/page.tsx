import { Experience } from "@/components/experience";
import { Reveal } from "@/components/reveal";
import { VideoPlayer } from "@/components/video-player";
import { CHANNEL_URL } from "@/lib/video-feed";
import { getLatestVideos } from "@/lib/youtube";
import manifest from "@/lib/frame-manifest.json";

export const revalidate = 3600;
const messages = [
  { image: "message-1", width: 643, height: 142, text: "подвал билдеров бсзп: дак билды в прогрузе пк нагружают" },
  { image: "message-2", width: 860, height: 108, text: "подвал билдеров бсзп: а вы шарите за сикс севен" },
  { image: "message-3", width: 597, height: 108, text: "подвал билдеров бсзп: иди нахуй" },
  { image: "message-4", width: 693, height: 131, text: "подвал билдеров бсзп: прошка фурри и чуть чуть фембой" },
  { image: "message-5", width: 738, height: 134, text: "подвал билдеров бсзп: переименуй сталкрафт мемы в сталкрафт фурри" },
  { image: "message-6", width: 868, height: 144, text: "подвал билдеров бсзп: я ленивое чмо сделал озвучку ролика недели 4 назад и не могу снять видооооос" },
];

function Message({ index }: { index: number }) {
  const message = messages[index];
  return <Reveal className="message">
    {/* Original PSD pixels preserve avatars, typography, and message metadata. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/images/${message.image}.webp`} width={message.width} height={message.height} alt={message.text} loading="lazy" style={{ width: `${message.width / 868 * 100}%` }} />
  </Reveal>;
}

export default async function Home() {
  const videos = await getLatestVideos();
  return (
    <>
      <a className="skip-link" href="#podval">К ссылкам и видео</a>
      <main id="top">
        <Experience />
        <noscript>
          <div className="noscript-art"><img src={manifest.frames.at(-1)} width={manifest.width} height={manifest.height} alt="Объёмная эмблема Билдерс" /></div>
          <style>{`.sequence-layer,.scroll-hint{display:none}.experience{height:100svh}.experience-sticky{position:relative}.message,.section-link,.video-reveal,.youtube-comment,.soon-reveal{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
        <section id="podval" className="telegram-section" aria-labelledby="telegram-title">
          <div className="telegram-content mx-auto">
            <Message index={0} /><Message index={1} /><Message index={2} />
            <Reveal className="section-link telegram-link"><h2 id="telegram-title" className="type-display">
              <a href="https://bscp_podval.t.me" target="_blank" rel="noopener noreferrer">BSCP_PODVAL.t.me<span className="sr-only"> (откроется в новой вкладке)</span></a>
            </h2></Reveal>
            <Message index={3} /><Message index={4} /><Message index={5} />
          </div>
        </section>
        <section className="youtube-section" aria-labelledby="youtube-title">
          <div className="youtube-grid mx-auto">
            <Reveal className="youtube-comment">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/youtube-comment.webp" width={575} height={157} loading="lazy" alt="@buildersc_production: 🔥 Сталкрафтеры дуреют с этой прикормки 👉" />
            </Reveal>
            <Reveal className="video-reveal video-first"><VideoPlayer video={videos[0]} /></Reveal>
            <Reveal className="section-link youtube-link"><h2 id="youtube-title" className="type-display">
              <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">@buildersc_production<span className="sr-only"> (откроется в новой вкладке)</span></a>
            </h2></Reveal>
            <Reveal className="video-reveal video-second"><VideoPlayer video={videos[1]} /></Reveal>
          </div>
        </section>
        <footer className="soon-section flex items-center justify-center"><Reveal className="soon-reveal text-center">
          <p className="soon-title type-display">SKOPO</p><p className="soon-subtitle type-display">(SOON)</p>
        </Reveal></footer>
      </main>
    </>
  );
}
