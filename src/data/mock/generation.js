export const emptyOrbData = { sources: [], sops: [], faqs: [], products: [], jobs: [], generations: [] }
export const sampleData = {
  sources: [{ id: 'src-1', type: 'Website', label: 'orb.example.com', status: 'Synced', lastSynced: 'Today' }, { id: 'src-2', type: 'Text', label: 'Customer onboarding notes', status: 'Ready', lastSynced: 'Today' }],
  sops: [{ id: 'sop-1', title: 'Handle a billing question', category: 'Support', lifecycle: 'Customer', status: 'Draft', source: 'orb.example.com', updated: 'Today', situation: 'A customer asks about a charge.', checkFirst: 'Review the account invoice.', whatToDo: 'Explain the charge and correct it when needed.', whatToSay: 'I checked the invoice and here is what happened.', escalateTo: 'Billing team' }],
  faqs: [{ id: 'faq-1', question: 'How do I change my plan?', answer: 'Open billing settings and choose a new plan.', category: 'Billing', status: 'Draft', source: 'orb.example.com', updated: 'Today' }],
  products: [{ id: 'prd-1', name: 'Orb Starter', price: '$39/month', url: 'https://orb.example.com/pricing', description: 'Knowledge tools for small teams.' }], jobs: [], generations: [{ id: 'gen-1', source: 'orb.example.com', date: 'Today', outputs: ['SOPs', 'FAQs', 'Products'], status: 'Done' }],
}
