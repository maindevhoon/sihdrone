import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './console.css';

// Last-resort boundary: the 3D views have their own; this keeps a broken render from blanking the page.
class AppBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="app-error"><div><h1>Trinetra hit an unexpected problem</h1><p>Your saved results are still in this browser. Reload to continue training.</p><button className="primary-button" onClick={()=>location.reload()}>Reload</button></div></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppBoundary><App /></AppBoundary></React.StrictMode>);

// Offline support for production builds only, so development never serves stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
