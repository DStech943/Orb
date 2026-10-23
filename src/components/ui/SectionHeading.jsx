import React from 'react'
import Badge from './Badge'
export default function SectionHeading({ badge, title, id, className = '' }) { return <div className={`mx-auto max-w-2xl text-center ${className}`}>{badge && <Badge>{badge}</Badge>}<h2 id={id} className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h2></div> }
