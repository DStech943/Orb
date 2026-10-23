import React from 'react'
import ContentListPage from '../components/app/ContentListPage'
import { deleteFaq, listFaqs, updateFaq } from '../services/generation'
export default function Faqs() { return <ContentListPage kind="faq" list={listFaqs} update={updateFaq} remove={deleteFaq} /> }
