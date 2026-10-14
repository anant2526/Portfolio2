import Experience from "@/components/Experience";
import About from "@/components/sections/About";
import Contact from "@/components/sections/Contact";
import Hero from "@/components/sections/Hero";
import Journey from "@/components/sections/Journey";
import Skills from "@/components/sections/Skills";
import Work from "@/components/sections/Work";

export default function Home() {
  return (
    <Experience>
      <Hero />
      <About />
      <Skills />
      <Work />
      <Journey />
      <Contact />
    </Experience>
  );
}
