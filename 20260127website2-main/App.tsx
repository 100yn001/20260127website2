import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './components/Home';
import { About } from './components/About';
import { Support } from './components/Support';
import { Privacy } from './components/Privacy';
import { Navbar } from './components/Navbar';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen w-full bg-black text-white font-['EB_Garamond'] selection:bg-red-900 selection:text-white overflow-x-hidden overflow-y-auto">
        <Navbar />
        
        <main className="w-full min-h-screen relative">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            <Route path="/privacy" element={<Privacy />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
