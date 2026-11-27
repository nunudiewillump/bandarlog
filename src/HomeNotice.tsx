import type { ComponentPropsWithRef } from 'react';
import './home-notices.css';

export function HomeNotice({ className = '', ...props }: ComponentPropsWithRef<'section'>) {
  return <section {...props} className={`home-notice ${className}`} />;
}
