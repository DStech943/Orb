import React, { createContext, useContext } from 'react'

// The marketing site and auth screens keep their bold "brutal" look. Everything inside
// the signed-in app uses the refined Orb design language. Primitives read this context
// so a single component serves both without duplicated imports.
const UiStyleContext = createContext('app')

export function BrutalStyle({ children }) {
  return <UiStyleContext.Provider value="brutal">{children}</UiStyleContext.Provider>
}

export const useUiStyle = () => useContext(UiStyleContext)
