import React from 'react'
import ContentListPage from '../components/app/ContentListPage'
import { deleteSop, listSops, updateSop } from '../services/generation'
export default function Sops() { return <ContentListPage kind="sop" list={listSops} update={updateSop} remove={deleteSop} /> }
