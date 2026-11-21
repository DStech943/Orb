import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { transitionNavigate } from '../../lib/viewTransition'

/** A Link that glides the shared orb between the landing and sign in pages. */
export default function TransitionLink({ to, state, replace, onClick, target, ...rest }) {
  const navigate = useNavigate()
  const handleClick = (event) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || target) return
    event.preventDefault()
    transitionNavigate(navigate, to, { state, replace })
  }
  return <Link to={to} state={state} replace={replace} target={target} onClick={handleClick} {...rest} />
}
