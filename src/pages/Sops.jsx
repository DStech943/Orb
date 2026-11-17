import React from 'react'
import ContentListPage from '../components/app/ContentListPage'
import { createManualSopEntry, deleteSop, deleteSops, listSops, updateSop } from '../services/generation'
export default function Sops({ reference }) { return <ContentListPage kind="sop" list={listSops} update={updateSop} remove={deleteSop} removeMany={deleteSops} createItem={createManualSopEntry} reference={reference} /> }
