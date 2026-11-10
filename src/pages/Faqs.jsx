import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import ContentListPage from '../components/app/ContentListPage'
import { deleteFaq, listFaqs, publishApprovedFaqs, updateFaq } from '../services/generation'
import { activeBrandName, createAssistantFaq } from '../services/orbApi'

export default function Faqs() {
  const [search] = useSearchParams()
  const initialDraft = useMemo(() => {
    const question = search.get('draftQuestion') || ''
    const answer = search.get('draftAnswer') || ''
    const category = search.get('draftCategory') || 'Support'
    if (!question && !answer) return null
    return { id: `orb-faq-draft:${question}:${answer}:${category}`, question, answer, category, status: 'Draft', source: 'Orb draft', updated: 'Not saved' }
  }, [search])

  const saveFaq = (faq) => String(faq?.id || '').startsWith('orb-faq-draft:')
    ? createAssistantFaq({ ...faq, id: undefined }, activeBrandName())
    : updateFaq(faq)

  return <ContentListPage kind="faq" list={listFaqs} update={saveFaq} remove={deleteFaq} publishApproved={publishApprovedFaqs} initialDraft={initialDraft} />
}
