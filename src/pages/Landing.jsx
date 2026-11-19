import React from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Hero from "../components/sections/Hero";
import Features from "../components/sections/Features";
import Faq from "../components/sections/Faq";
import CtaBand from "../components/sections/CtaBand";

export default function Landing() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
