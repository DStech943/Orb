import React, { useState } from "react";
import { faqs } from "../../data/faqs";
import Accordion from "../ui/Accordion";
import SectionHeading from "../ui/SectionHeading";
import useInView from "../../hooks/useInView";

export default function Faq() {
  const [openIndex, setOpenIndex] = useState(0);
  const [ref, visible] = useInView();

  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-canvas px-5 pb-24">
      <div
        ref={ref}
        className={`reveal mx-auto max-w-3xl ${visible ? "is-visible" : ""}`}
      >
        <SectionHeading
          id="faq-title"
          badge="Frequently Asked"
          title="Most Asked Questions"
          description="Everything you need to know about setting up and operating your brand AI agent."
        />

        <div className="mt-12 rounded-3xl border border-line bg-white p-3 shadow-card divide-y divide-line sm:p-5">
          {faqs.map((item, index) => (
            <Accordion
              key={item.question}
              item={item}
              index={index}
              isOpen={openIndex === index}
              onToggle={() =>
                setOpenIndex(openIndex === index ? -1 : index)
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
