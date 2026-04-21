import { CantoLogo } from "@/components/CantoLogo";
import { LaunchChatButton } from "@/components/LaunchChatButton";
import { PersonaWidget } from "@/components/PersonaWidget";

const PERSONA_CLIENT_TOKEN =
  "ct_test_01kpr9vf_d6fd657b3dfd9144d3c4466780e1982a";

const AGENTS = [
  {
    icon: "🎬",
    title: "Creative Brief",
    description:
      "Turn a campaign idea into a structured brief with the right assets attached.",
  },
  {
    icon: "📐",
    title: "Channel Export",
    description:
      "Resize and render assets to any channel spec — social, web, print.",
  },
  {
    icon: "🏷️",
    title: "Auto-Tag",
    description:
      "Bulk-tag and describe assets so your DAM stays searchable at scale.",
  },
  {
    icon: "🔍",
    title: "Ask-your-DAM",
    description:
      "Natural-language search across every asset, tag, and metadata field.",
  },
] as const;

export default function Home() {
  const requireAuth = process.env.REQUIRE_AUTH === "true";
  void requireAuth;

  return (
    <>
      <header className="border-b border-[#F0F0F0]">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <CantoLogo />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-20">
        <section className="flex flex-col items-center text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-[#1A1A1A] sm:text-6xl">
            Canto AI Suite
          </h1>
          <p className="mt-4 text-lg text-[#6B6B6B]">Your DAM, smarter.</p>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((agent) => (
            <article
              key={agent.title}
              className="rounded-xl border border-[#F0F0F0] bg-white p-6 transition-colors hover:border-[#E5E5E5]"
            >
              <div className="text-2xl leading-none" aria-hidden="true">
                {agent.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#1A1A1A]">
                {agent.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#6B6B6B]">
                {agent.description}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-16 flex justify-center">
          <LaunchChatButton />
        </section>
      </main>

      <PersonaWidget clientToken={PERSONA_CLIENT_TOKEN} />
    </>
  );
}
