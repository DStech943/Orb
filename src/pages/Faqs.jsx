import React from 'react'
import ContentListPage from '../components/app/ContentListPage'
import { deleteFaq, deleteFaqs, listFaqs, updateFaq } from '../services/generation'
import { activeBrandName, createAssistantFaq } from '../services/orbApi'

export default function Faqs() {
  const createFaq = (faq) => createAssistantFaq({ question: faq.question, answer: faq.answer }, activeBrandName())

  return <ContentListPage kind="faq" list={listFaqs} update={updateFaq} remove={deleteFaq} removeMany={deleteFaqs} createItem={createFaq} />
}
