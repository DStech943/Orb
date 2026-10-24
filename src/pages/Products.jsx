import React from 'react'
import ContentListPage from '../components/app/ContentListPage'
import { deleteProduct, listProducts, saveProduct } from '../services/generation'

export default function Products() {
  return <ContentListPage kind="product" list={listProducts} update={saveProduct} remove={deleteProduct} />
}
